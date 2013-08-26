/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Update stream client
 */

var assert = require('assert-plus');
var backoff = require('backoff');
var EventEmitter = require('events').EventEmitter;
var fast = require('fast');
var once = require('once');
var util = require('util');



// --- UpdateClient object



function UpdateClient(opts, log) {
    this.opts = opts;
    this.log = log;
    this.streaming = false;

    EventEmitter.call(this);
}

util.inherits(UpdateClient, EventEmitter);



UpdateClient.prototype.ping = function pingServer(callback) {
    var req = this.client.rpc('ping', {});
    req.once('end', callback);
    req.once('error', callback);
};


UpdateClient.prototype.start = function startUpdateWatching() {
    var self = this;
    var req = this.client.rpc('messages', {
        client_id: this.opts.client_id
    });
    self.streaming = true;

    function done(err) {
        if (err) {
            self.log.error(err, 'error from updates rpc');
        } else {
            self.log.info('updates rpc closed on other end');
        }

        self.client.removeAllListeners('message');
    }

    req.once('end', done);
    req.once('error', done);

    req.on('message', function onObject(msg) {
        self.emit('message', msg);
    });
};


UpdateClient.prototype.restart = function restartUpdateWatching() {
    // XXX: if sequence numbers differ, do a sync.
    this.start();
};



// --- Internals



function retryConnect(opts, callback) {
    assert.object(opts, 'options');
    assert.func(callback, 'callback');

    callback = once(callback);
    var log = opts.log;

    function _connect(_, cb) {
        cb = once(cb);
        var client = fast.createClient(opts);

        client.on('connectAttempt', function (number, delay) {
            var level;
            if (number === 0) {
                level = 'info';
            } else if (number < 5) {
                level = 'warn';
            } else {
                level = 'error';
            }

            log[level]({ host: opts.host, attempt: number, delay: delay },
                'connect attempted');
        });

        client.once('connect', function onConnect() {
            client.removeAllListeners('error');
            cb(null, client);
        });

        client.once('error', function onConnectError(err) {
            client.removeAllListeners('connect');
            cb(err);
        });
    }

    var retry = backoff.call(_connect, {}, function (err, client) {
        retry.removeAllListeners('backoff');
        log.debug('fast: connected to %s after %d attempts',
            opts.host, retry.getResults().length);
        callback(err, client);
    });

    retry.setStrategy(new backoff.ExponentialStrategy({
        initialDelay: opts.minTimeout || 100,
        maxDelay: opts.maxTimeout || 60000
    }));
    retry.failAfter(opts.retries || Infinity);

    retry.on('backoff', function onBackoff(number, delay) {
        var level;
        if (number === 0) {
            level = 'info';
        } else if (number < 5) {
            level = 'warn';
        } else {
            level = 'error';
        }

        log[level]({
            attempt: number,
            delay: delay
        }, 'connect attempted');
    });

    retry.start();
}



// --- Exports



function connect(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.host, 'opts.host');
    assert.object(opts.log, 'opts.log');
    assert.number(opts.port, 'opts.port');
    assert.string(opts.client_id, 'opts.client_id');
    assert.func(callback, 'callback');

    callback = once(callback);
    var connOpts = { host: opts.host, port: opts.port };
    var log = opts.log.child({ component: 'update_client' });
    var updateClient = new UpdateClient(opts, log);

    retryConnect(opts, function connect_cb(connectErr, client) {
        if (connectErr) {
            log.error(connectErr, 'fast client: connection error');
            return callback(connectErr);
        }

        client.log = log;

        // node-fast has reconnect logic, so just capture that events
        // happened, and let it handle
        client.on('error', function (err) {
            if (!client._deadbeef) {
                log.error(err, 'client error');
            }
        });

        client.on('close', function () {
            if (!client._deadbeef) {
                log.warn(connOpts, 'connection closed');
            }
        });

        client.on('connect', function () {
            if (!client._deadbeef) {
                log.info(connOpts, 'connected');
                if (updateClient.streaming) {
                    updateClient.restart();
                }
            }
        });

        updateClient.client = client;
        return callback(null, updateClient);
    });
}



module.exports = {
    connect: connect
};
