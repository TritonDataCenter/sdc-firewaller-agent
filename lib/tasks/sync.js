/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Syncs the rule and remote VM state with FWAPI and VMAPI
 */

var assert = require('assert-plus');
var async = require('async');
var fw = require('../fw');
var FWAPI = require('sdc-clients').FWAPI;
var mod_vm = require('../vm');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');
var vasync = require('vasync');
var VMAPI = require('sdc-clients').VMAPI;



function updateOwnerRules(opts, callback) {
    async.eachSeries(opts.resolve, function _update(payload, cb) {
        opts.fwapi.post('/resolve', payload, function (err, resolved) {
            if (err) {
                // XXX: retry?
                return cb(err);
            }

            if (!resolved || prim.isEmpty(resolved) || !resolved.rules ||
                resolved.rules.length === 0) {
                opts.log.debug({ payload: payload, resolved: resolved },
                    'No resolve data: returning');
                return cb();
            }

            opts.cache.addResolveData(payload);
            opts.data = resolved;
            opts.data.serverUUID = opts.config.serverUUID;

            mod_vmapi.list(opts, function (err2, vms) {
                if (err2) {
                    return cb(err2);
                }

                var updatePayload = {
                    log: opts.log,
                    owner_uuid: resolved.owner_uuid,
                    payload: {
                        rules: resolved.rules,
                        vms: opts.vms
                    }
                };

                if (vms) {
                    updatePayload.payload.remoteVMs = vms;
                }

                fw.update(updatePayload, function (err3, res) {
                    if (err3) {
                        return cb(err3);
                    }

                    opts.log.debug(res, 'Updated rules for owner_uuid="%s"',
                        resolved.owner_uuid);
                    return cb(null, res);
                });
            });
        });

    }, function _done(err) {
        opts.log.debug(opts.cache.state, 'cache state after resolve');
        return callback(err);
    });
}



function syncFromAPIs(opts, callback) {
    mod_vm.list({ firewall_enabled: true }, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var owner;
        var ownerVMs = {};
        var t;

        for (var v in vms) {
            var vm = vms[v];
            if (!vm.firewall_enabled) {
                continue;
            }

            owner = vm.owner_uuid || 'none';
            if (!ownerVMs.hasOwnProperty(owner)) {
                ownerVMs[owner] = {};
            }

            if (!ownerVMs[owner].hasOwnProperty('vms')) {
                ownerVMs[owner].vms = {};
            }

            if (!ownerVMs[owner].hasOwnProperty('tags')) {
                ownerVMs[owner].tags = {};
            }

            ownerVMs[owner].vms[vm.uuid] = 1;

            for (t in vm.tags) {
                if (!ownerVMs[owner].tags.hasOwnProperty(t)) {
                    ownerVMs[owner].tags[t] = {};
                }
                ownerVMs[owner].tags[t][vm.tags[t]] = 1;
            }
        }

        var payloads = [];

        for (owner in ownerVMs) {
            var payload = {};

            if (owner !== 'none') {
                payload.owner_uuid = owner;
            }

            var resVMs = ownerVMs[owner].vms;
            if (resVMs && !prim.isEmpty(resVMs)) {
                payload.vms = Object.keys(resVMs);
            }

            var resTags = ownerVMs[owner].tags;
            if (resTags && !prim.isEmpty(resTags)) {
                payload.tags = {};
                for (t in resTags) {
                    payload.tags[t] = Object.keys(resTags[t]);
                }
            }

            if (prim.isEmpty(payload)) {
                opts.log.warn('No VMs or tags for owner_uuid "%s"', owner);
                continue;
            }

            payloads.push(payload);
        }

        opts.log.debug({ ownerVMs: ownerVMs, payloads: payloads },
            'resolving rule data from FWAPI');
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
    fw.list({}, function (err, rules) {
        if (err) {
            opts.log.errror(err, 'Error listing firewall rules');
            return callback(err);
        }

        var hitError = false;
        var toSync = [];

        for (var r in rules) {
            var rule = rules[r];
            if (!rule.hasOwnProperty('created_by')
                || rule.created_by !== 'fwapi') {
                toSync.push(rule);
            }
        }

        if (toSync.length === 0) {
            opts.log.info('No local rules to sync to FWAPI');
            return callback();
        }

        mod_vm.list(function (vErr, vms) {
            if (vErr) {
                opts.log.error(vErr, 'FWAPI sync: error listing VMs');
                return callback(vErr);
            }

            async.each(toSync, function _update(syncRule, cb) {
                opts.fwapi.createRule(syncRule, function (err, newRule) {
                    if (err) {
                        opts.log.error({ err: err, rule: syncRule },
                            'Error creating rule in FWAPI');
                        return cb();
                        hitError = true;
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
            }, function _doneFWAPI(err) {
                opts.log.debug('Done syncing rules to FWAPI');
                return callback(err);
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
    assert.object(opts.config.fwapi, 'opts.config.fwapi');
    assert.string(opts.config.fwapi.host, 'opts.config.fwapi.host');
    assert.object(opts.config.vmapi, 'opts.config.vmapi');
    assert.string(opts.config.vmapi.host, 'opts.config.vmapi.host');
    assert.string(opts.config.serverUUID, 'opts.config.serverUUID');

    opts.fwapi = new FWAPI({ url: 'http://' + opts.config.fwapi.host });
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
