/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Syncs the rule and remote VM state with FWAPI and VMAPI
 */

var assert = require('assert-plus');
var async = require('async');
var fw = require('../fw');
var mod_fwapi = require('../fwapi');
var mod_vm = require('../vm');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');
var vasync = require('vasync');
var VMAPI = require('sdc-clients').VMAPI;



function updateOwnerRules(opts, callback) {
    async.eachSeries(opts.resolve, function _update(payload, cb) {
        mod_fwapi.resolve(opts, payload, cb);

    }, function _done(err) {
        opts.log.debug(opts.cache.state, 'cache state after resolve');
        return callback(err);
    });
}



function syncFromAPIs(opts, callback) {
    mod_vm.list({ }, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var payloads = mod_fwapi.buildResolvePayload({
            log: opts.log,
            vms: vms
        });

        opts.log.debug({ payloads: payloads },
            'sync: resolve payloads');
        opts.resolve = payloads;

        mod_vm.list(function (err2, allVMs) {
            if (err2) {
                return callback(err2);
            }

            opts.vms = allVMs;
            return updateOwnerRules(opts, callback);
        });
    });
}


/**
 * Adds rules that only exist locally to FWAPI
 */
function syncToFWAPI(opts, callback) {
    opts.log.debug('Syncing rules to FWAPI');
    var listPayload = {
        log: opts.log,
        req_id: opts.req_id,
        payload: {}
    };

    fw.list(listPayload, function (err, rules) {
        if (err) {
            opts.log.error(err, 'Error listing firewall rules');
            return callback(err);
        }

        /*jsl:ignore*/
        var hitError = false;
        /*jsl:end*/
        var toSync = [];

        for (var r in rules) {
            var rule = rules[r];
            if (!rule.hasOwnProperty('created_by') ||
                rule.created_by !== 'fwapi') {
                toSync.push(rule);
            }
        }

        if (toSync.length === 0) {
            opts.log.info('No local rules to sync to FWAPI');
            return callback();
        }

        opts.log.debug({ rules: toSync }, 'rules to sync');

        mod_vm.list(function (vErr, vms) {
            if (vErr) {
                opts.log.error(vErr, 'FWAPI sync: error listing VMs');
                return callback(vErr);
            }

            async.forEachSeries(toSync, function _update(syncRule, cb) {
                opts.fwapi.createRule(syncRule, function (cErr, newRule) {
                    if (cErr) {
                        opts.log.error({ err: cErr, rule: syncRule },
                            'Error creating rule in FWAPI');
                        hitError = true;
                        return cb();
                    }

                    // Need to re-add the rule so that it gets created_by=fwapi
                    // (otherwise we'd hit this code path next time we sync)
                    var toAdd = {
                        log: opts.log,
                        payload: { vms: vms, rules: [ newRule ] }
                    };

                    fw.add(toAdd, function (err2, res2) {
                        if (err2) {
                            opts.log.error({ err: err2, rule: newRule },
                                'Error adding rule');
                            hitError = true;
                            return cb();
                        }

                        opts.log.info(res2, 'Added rule');
                        return cb();
                    });
                });
            }, function _doneFWAPI(finalErr) {
                opts.log.debug('Done syncing rules to FWAPI');
                return callback(finalErr);
            });
        });
    });
}



// --- Exports



/**
 * Syncs firewall state to / from FWAPI and VMAPI
 */
function sync(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.cache, 'opts.cache');
    assert.object(opts.config, 'opts.config');
    assert.object(opts.config.vmapi, 'opts.config.vmapi');
    assert.string(opts.config.vmapi.host, 'opts.config.vmapi.host');
    assert.string(opts.config.serverUUID, 'opts.config.serverUUID');

    opts.fwapi = mod_fwapi.createClient(opts);
    opts.vmapi = new VMAPI({ url: 'http://' + opts.config.vmapi.host });

    vasync.pipeline({
        arg: opts,
        funcs: [
            syncFromAPIs,
            syncToFWAPI
            // XXX: delete RVMs / rules that aren't in use anymore

        ] }, function (err) {
            opts.fwapi.client.close();
            opts.vmapi.client.close();

            return callback(err);
        });
}



module.exports = {
    run: sync
};
