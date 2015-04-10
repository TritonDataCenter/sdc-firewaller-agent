/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Firewaller agent daemon
 */

var assert = require('assert-plus');
var backoff = require('backoff');
var endpoints = require('./endpoints');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var fw = require('./fw');
var os = require('os');
var path = require('path');
var restify = require('restify');
var stream = require('fast-stream');
var tasks = require('./tasks');
var uuid = require('node-uuid');
var util = require('util');
var vasync = require('vasync');
var VMCache = require('./cache').VMCache;



// --- Globals



var VERSION = JSON.parse(fs.readFileSync(path.normalize(
    __dirname + '/../package.json'), 'utf8')).version;



// --- Internal



/**
 * Add the sync task to the queue - run every self.config.syncInterval
 * minutes.
 */
function runSyncInterval(log, queue) {
    var message = {
        name: 'sync',
        req_id: uuid.v4()
    };
    var rlog = log.child({
        req_id: message.req_id
    });

    rlog.info('Adding sync task to queue');
    queue.push(message);
}



// --- FwAgent object



/**
 * FwAgent constructor
 */
function FwAgent(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');

    assert.object(opts.fwapi, 'opts.fwapi');
    assert.string(opts.fwapi.host, 'opts.fwapi.host');
    assert.object(opts.fwapi.fast, 'opts.fwapi.fast');
    assert.number(opts.fwapi.fast.port, 'opts.fwapi.fast.port');
    assert.object(opts.fwapi.fast.retry, 'opts.fwapi.fast.retry');
    assert.number(opts.fwapi.fast.retry.minTimeout,
        'opts.fwapi.fast.retry.minTimeout');
    assert.number(opts.fwapi.fast.retry.maxTimeout,
        'opts.fwapi.fast.retry.maxTimeout');
    assert.ok(opts.fwapi.fast.retry.retries, 'opts.fwapi.fast.retry.retries');

    assert.object(opts.restify, 'opts.restify');
    assert.number(opts.restify.port, 'opts.restify.port');

    assert.object(opts.retry, 'opts.retry');
    assert.number(opts.retry.minTimeout, 'opts.retry.minTimeout');
    assert.number(opts.retry.maxTimeout, 'opts.retry.maxTimeout');
    assert.ok(opts.retry.retries, 'opts.retry.retries');

    assert.string(opts.serverUUID, 'opts.serverUUID');
    assert.string(opts.imageVersion, 'opts.imageVersion');
    assert.number(opts.syncInterval, 'opts.syncInterval');

    assert.object(opts.vmapi, 'opts.vmapi');
    assert.string(opts.vmapi.host, 'opts.vmapi');

    var self = this;
    this.cache = new VMCache();
    this.config = opts;
    this.log = opts.log;

    // Don't include the loggers as part of the logged config
    delete opts.log;
    delete this.config.log;
    this.log.info(this.config, 'Agent config');

    this.config.fwapi.fast.log = this.log;
    this.config.fwapi.fast.host = opts.fwapi.host;
    this.config.fwapi.fast.client_id = opts.serverUUID;

    if (opts.imageVersion < '20131105T084235Z') {
        fw._setOldIPF();
    }

    this.client = stream.createClient(this.config.fwapi.fast);
    // API queue: for requests that come in via the HTTP API
    this.apiQueue = vasync.queue(self.runTask.bind(self), 1);
    // Queue for tasks that come in from FWAPI
    this.queue = vasync.queue(self.runTask.bind(self), 1);
    this.recentTasks = [];
    this.server = restify.createServer({
        name: 'firewaller',
        version: VERSION
    });

    this.server.use(function (req, res, next) {
        res.on('header', function onHeader() {
            var now = Date.now();
            res.header('Date', new Date());
            res.header('Server', self.server.name);
            res.header('x-request-id', req.getId());
            var t = now - req.time();
            res.header('x-response-time', t);
            res.header('x-server-name', os.hostname());
        });
        next();
    });
    self.server.use(restify.queryParser());
    self.server.use(restify.bodyParser());
    self.server.use(restify.requestLogger());

    function populateReq(req, res, next) {
        req.app = self;
        return next();
    }

    endpoints.register(this.server, this.log, [ populateReq ]);

    EventEmitter.call(this);
}

util.inherits(FwAgent, EventEmitter);


/**
 * Closes the update client and restify server
 */
FwAgent.prototype.close = function close() {
    if (this.server && this.serverListening) {
        this.server.close();
    }

    if (this.client) {
        this.client.close();
    }

    if (this.syncInterval) {
        clearInterval(this.syncInterval);
    }
};


/**
 * Connects to the APIs to start receiving updates
 *
 * @param {Function} callback : f(err, res)
 */
FwAgent.prototype.connect = function connect(callback) {
    var client = this.client;
    var self = this;

    this.server.listen(this.config.restify.port, function () {
        self.serverListening = true;
        self.log.info('listening on %s', self.server.url);

        client.connect(function (err) {
            if (err) {
                return callback(err);
            }

            client.ping(function (err2, res) {
                if (err2) {
                    self.log.error(err2, 'error pinging');
                    return;
                }

                self.log.info(res, 'server %s ping OK', self.config.fwapi.host);
            });

            client.start(function (err3) {
                if (err3) {
                    return callback(err3);
                }

                client.on('message', function handleMessage(message) {
                    if (!message.req_id) {
                        message.req_id = uuid.v4();
                    }

                    var log = self.log.child({
                        req_id: message.req_id
                    });

                    log.debug({ message: message }, 'message received');
                    if (!tasks.hasOwnProperty(message.name)) {
                        self.log.warn({ message: message },
                            'Receieved unknown message type: ignoring');
                        return;
                    }

                    if (!message.value) {
                        self.log.warn({ message: message }, 'Receieved '
                            + 'message without value property: ignoring');
                        return;
                    }

                    self.queue.push(message);
                });

                var syncTime = self.config.syncInterval * 60 * 1000;
                self.log.debug({ interval: syncTime }, 'sync interval');
                self.syncInterval = setInterval(runSyncInterval, syncTime,
                    self.log, self.queue);

                return callback();
            });
        });
    });
};


/**
 * Runs the task in message.name, passing message.log and message.value
 */
FwAgent.prototype.runTask = function runTask(message, callback) {
    var self = this;
    var log = self.log.child({ req_id: message.req_id });
    log.info('Running task "%s"', message.name);

    return tasks[message.name]({
        cache: this.cache,
        config: this.config,
        log: log,
        req_id: message.req_id,
        value: message.value
    }, function (err, res) {
        if (err) {
            log.error(err, 'Error running task "%s"', message.name);
        }

        self.recentTasks.unshift(message.req_id);
        if (self.recentTasks.length > self.config.recentTasksLength) {
            self.recentTasks.pop();
        }

        log.info('Task "%s" complete', message.name);
        self.emit('task-complete', err, message);

        return callback(err, res);
    });
};


/**
 * Update or add the rule in opts.value
 */
FwAgent.prototype.updateRule = function updateRule(opts, callback) {
    // Force the add, since the VM doesn't exist yet
    opts.value.force = true;
    var message = {
        name: 'fw.add_rule',
        req_id: opts.req_id,
        value: opts.value
    };

    this.apiQueue.push(message, function _afterQueuedUpdate(err, res) {
        if (err) {
            return callback(err);
        }

        return callback(null, res.rules[0]);
    });
};


/**
 * Syncs the local firewall state with FWAPI (both rules and remote VMs)
 *
 * @param {Function} callback : f(err, res)
 */
FwAgent.prototype.sync = function sync(callback) {
    var self = this;
    function _sync(_, cb) {
        self.runTask({
            name: 'sync',
            req_id: uuid.v4()
        }, cb);
    }

    var retry = backoff.call(_sync, {}, function (err, res) {
        retry.removeAllListeners('backoff');
        self.log.debug({
            fwapi: self.config.fwapi.host,
            vmapi: self.config.vmapi.host
        }, 'synced state after %d attempts', retry.getResults().length);
        return callback(err, res);
    });

    retry.setStrategy(new backoff.ExponentialStrategy({
        initialDelay: self.config.retry.minTimeout || 100,
        maxDelay: self.config.retry.maxTimeout || 30000
    }));
    retry.failAfter(self.config.retry.retries);

    retry.on('backoff', function onBackoff(number, delay) {
        var level;
        if (number === 0) {
            level = 'info';
        } else if (number < 5) {
            level = 'warn';
        } else {
            level = 'error';
        }

        self.log[level]({ attempt: number, delay: delay },
            'sync attempted');
    });

    retry.start();
};



// --- Exports



/**
 * Creates a new FwAgent object
 */
function create(opts) {
    return new FwAgent(opts);
}



module.exports = {
    create: create
};
