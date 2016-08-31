/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
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



// --- Internal



/**
 * List all rules and store in opts.allRules
 */
function optsListRules(opts, callback) {
    var listPayload = {
        log: opts.log,
        req_id: opts.req_id,
        payload: {}
    };

    fw.list(listPayload, function (err, rules) {
        if (rules) {
            opts.allRules = rules;
        }

        return callback(err);
    });
}


/**
 * List all remote VMs and store in opts.allRVMs
 */
function optsListRVMs(opts, callback) {
    var listPayload = {
        log: opts.log,
        req_id: opts.req_id,
        payload: {}
    };

    fw.listRVMs(listPayload, function (err, rvms) {
        if (rvms) {
            opts.allRVMs = rvms;
        }

        return callback(err);
    });
}


/**
 * List VMs and store in opts.allVMs
 */
function optsListVMs(opts, callback) {
    mod_vm.list(opts.log, function (err, vms) {
        if (vms) {
            opts.allVMs = vms;
        }

        return callback(err);
    });
}


/**
 * Rules that are present on the local system but weren't resolved during
 * the sync process no longer apply, so should be removed.
 */
function removeDeletedRules(opts, callback) {
    opts.log.debug('Removing local rules and RVMs no longer in FWAPI');
    var local = [];
    var toDel = {
        rvmUUIDs: [],
        uuids: []
    };

    opts.allRules.forEach(function (rule) {
        // Omit local-only rules
        if (rule.created_by != 'fwapi') {
            local.push(rule);
            return;
        }

        if (!opts.resolved || !opts.resolved.rules.hasOwnProperty(rule.uuid)) {
            toDel.uuids.push(rule.uuid);
        }
    });

    opts.allRVMs.forEach(function (rvm) {
        if (!opts.resolved || !opts.resolved.vms.hasOwnProperty(rvm.uuid)) {
            toDel.rvmUUIDs.push(rvm.uuid);
        }
    });

    if (local.length !== 0) {
        opts.log.info({ localRules: local }, 'Local-only rules: not removing');
    }

    if (toDel.rvmUUIDs.length === 0 && toDel.uuids.length === 0) {
        opts.log.info('No removed rules or RVMs to delete');
        return callback();
    }

    opts.log.info(toDel, 'deleting rules / RVMs');
    toDel.vms = opts.allVMs;
    var delPayload = {
        log: opts.log,
        payload: toDel,
        req_id: opts.req_id
    };

    fw.del(delPayload, function (err) {
        if (err) {
            opts.log.info('Error deleting rules / RVMs');
        }

        return callback(err);
    });
}


/**
 * Sync rules from FWAPI and remote VMs from VMAPI
 */
function syncFromAPIs(opts, callback) {
    var payloads = mod_fwapi.buildResolvePayload({
        log: opts.log,
        vms: opts.allVMs
    });

    opts.log.debug({ payloads: payloads },
        'sync: resolve payloads');
    opts.resolve = payloads;
    opts.vms = opts.allVMs;

    return updateOwnerRules(opts, callback);
}


/**
 * Adds rules that only exist locally to FWAPI
 */
function syncToFWAPI(opts, callback) {
    opts.log.debug('Syncing rules to FWAPI');
    /*jsl:ignore*/
    var hitError = false;
    /*jsl:end*/
    var toSync = [];

    for (var r in opts.allRules) {
        var rule = opts.allRules[r];
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
                payload: { vms: opts.allVMs, rules: [ newRule ] }
            };

            fw.add(toAdd, function (err2, res2) {
                if (err2) {
                    opts.log.error({ err: err2, rule: newRule },
                        'Error adding rule');
                    hitError = true;
                    return cb();
                }

                // Need to add this to the resolved property in opts
                // so that it doesn't get deleted by
                // removeDeletedRules() later in the sync process:
                mod_fwapi.addResolvedToOpts(opts, null, [ newRule ]);

                opts.log.info(res2, 'Updated local rule');
                return cb();
            });
        });
    }, function _doneFWAPI(finalErr) {
        opts.log.debug('Done syncing rules to FWAPI');
        return callback(finalErr);
    });
}


/**
 * Resolve payloads in opts.resolve, which syncs VMs and rules from VMAPI
 * and FWAPI.
 *
 * We don't want an error syncing a rule from FWAPI to prevent applying
 * any other rules. Once we've applied FWAPI rules, we'll return an error
 * and avoid syncing back local rules that aren't in FWAPI.
 *
 */
function updateOwnerRules(opts, callback) {
    var hitError = false;
    async.eachSeries(opts.resolve, function _update(payload, cb) {
        mod_fwapi.resolve(opts, payload, function (err) {
            if (err) {
                opts.log.error(err,
                    'partial failure while syncing firewall rules');
                hitError = true;
            }
            return cb();
        });
    }, function _done(err) {
        opts.log.debug(opts.cache.state, 'cache state after resolve');
        if (err) {
            return callback(err);
        } else if (hitError) {
            return callback(new Error('failed to sync all firewall rules'));
        } else {
            return callback();
        }
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
    opts.vmapi = mod_vmapi.createClient(opts);

    vasync.pipeline({
        arg: opts,
        funcs: [
            optsListVMs,
            syncFromAPIs,
            optsListRules,
            syncToFWAPI,
            optsListRules,
            optsListRVMs,
            removeDeletedRules
        ]
    }, function (err) {
        opts.fwapi.client.close();
        opts.vmapi.client.close();

        return callback(err);
    });
}



module.exports = {
    run: sync
};
