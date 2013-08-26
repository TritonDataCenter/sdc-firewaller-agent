/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Firewaller agent daemon
 */

var assert = require('assert-plus');
var backoff = require('backoff');
var stream = require('./client');
var tasks = require('./tasks');
var uuid = require('node-uuid');
var vasync = require('vasync');
var VMCache = require('./cache').VMCache;



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

    assert.object(opts.retry, 'opts.retry');
    assert.number(opts.retry.minTimeout, 'opts.retry.minTimeout');
    assert.number(opts.retry.maxTimeout, 'opts.retry.maxTimeout');
    assert.ok(opts.retry.retries, 'opts.retry.retries');

    assert.string(opts.serverUUID, 'opts.serverUUID');

    assert.object(opts.vmapi, 'opts.vmapi');
    assert.string(opts.vmapi.host, 'opts.vmapi');

    this.cache = new VMCache();
    this.config = opts;
    this.log = opts.log;
    this.config.fwapi.fast.log = opts.log;
    this.config.fwapi.fast.host = opts.fwapi.host;
    this.config.fwapi.fast.client_id = opts.serverUUID;

    delete opts.log;
    delete this.config.log;
}


/**
 * Connects to the APIs to start receiving updates
 *
 * @param {Function} callback : f(err, res)
 */
FwAgent.prototype.connect = function connect(callback) {
    var self = this;

    function runNext(msg, cb) {
        self.runTask(msg, cb);
    }

    this.queue = vasync.queue(runNext, 1);

    stream.connect(this.config.fwapi.fast, function (err, client) {
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

        client.on('message', function handleMessage(message) {
            var log = self.log.child({
                req_id: message.req_id || uuid.v1()
            });

            log.debug(message, 'message received');
            if (!tasks.hasOwnProperty(message.name)) {
                self.log.warn(message,
                    'Receieved unknown message type "%s"', message.name);
                return;
            }
            message.log = log;

            self.queue.push(message, function _done(taskErr, res) {
                if (taskErr) {
                    log.error(taskErr, 'Error running task %s', message.name);
                    return;
                }

                log.info(res, 'Task %s complete', message.name);
            });
        });

        client.start();
    });
};


/**
 * Runs the task in message.name, passing message.log and message.value
 */
FwAgent.prototype.runTask = function runTask(message, callback) {
    return tasks[message.name]({
        cache: this.cache,
        log: message.log,
        config: this.config,
        payload: message.value
    }, callback);
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
            log: self.log.child({ component: 'update_client' }),
            name: 'sync'
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
    var agent = new FwAgent(opts);
    agent.log.info(opts, 'Agent config');
    return agent;
}



module.exports = {
    create: create
};
