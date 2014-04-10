/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Functions for interacting with VMAPI
 */

var assert = require('assert-plus');
var fw = require('./fw');
var mod_vm = require('./vm');
var prim = require('jsprim');
var util = require('util');
var VMAPI = require('sdc-clients').VMAPI;



// --- Internal



/**
 * Returns an LDAP filter suitable for passing to VMAPI's listVMs endpoint,
 * based on the following parameters in params:
 *
 * Required:
 * - owner_uuid :  match only VMs for this owner
 * - serverUUID : used to filter out VMs on this server (since we will never
 *   need to add "remote" VMs that are on this server)
 *
 * Optional:
 * - allVMs : if set, will fetch all VMs for the given owner_uuid. This
 *   (obviously) overrides the tags and vms filters
 * - tags : tags to filter by
 * - vms : array of VM UUIDs to filter by
 */
function vmFilter(params) {
    assert.object(params, 'params');
    assert.string(params.owner_uuid, 'params.owner_uuid');
    assert.string(params.serverUUID, 'params.serverUUID');

    if (params.allVMs) {
        return '(&' +
            '(owner_uuid=' + params.owner_uuid + ')' +
            '(!(server_uuid=' + params.serverUUID + '))' +
            '(!(state=destroyed))' +
            '(!(state=failed))' +
            '(!(state=provisioning))' +
            ')';
    }

    var filter = [];
    var t;
    var tags = params.tags || {};
    var v;
    var vms = params.vms || [];

    for (t in tags) {
        var vals = util.isArray(tags[t]) ? tags[t] : [ tags[t] ];
        for (v in vals) {
            filter.push('(tags=*' + t + '='
                + (vals[v] !== true ? vals[v] : '') + '*)');
        }
    }

    vms.forEach(function (vm) {
        filter.push('(uuid=' + vm + ')');
    });

    if (filter.length > 1) {
        filter = ['(|'].concat(filter).concat(')');
    }

    // Don't get data for VMs in a state where they have no IPs: destroyed,
    // failed, provisioning
    filter.unshift('(&');
    filter.push('(!(state=destroyed))');
    filter.push('(!(state=failed))');
    filter.push('(!(state=provisioning))');
    filter.push('(owner_uuid=' + params.owner_uuid + ')');
    filter.push('(!(server_uuid=' + params.serverUUID + '))');
    filter.push(')');

    return filter.join('');
}



// --- Exports



function listVMs(opts, callback) {
    var filter = opts.filter;
    var clientCreated = false;

    if (!opts.vmapi) {
        opts.vmapi = new VMAPI({ url: 'http://' + opts.config.vmapi.host });
        clientCreated = true;
    }

    if (!filter.tags && ! filter.vms && !filter.allVMs) {
        opts.log.debug(
            'vmapi.list: No tags, vms or allVMs for owner "%s": not getting',
            opts.filter.owner_uuid);
        return callback();
    }

    var tags = filter.tags || {};
    var vmsToFind = filter.vms || [];
    if (prim.isEmpty(tags) && vmsToFind.length === 0 && !filter.allVMs) {
        opts.log.debug('vmapi.list: No tags or VMs to get for owner "%s"',
            opts.filter.owner_uuid);
        return callback();
    }

    opts.vmapi.listVms({ query: vmFilter(opts.filter) }, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var rvms = [];
        for (var v in vms) {
            var vm = vms[v];

            // Skip VMs that are on this server
            if (vm.hasOwnProperty('server_uuid') &&
                vm.server_uuid == opts.filter.serverUUID) {
                continue;
            }

            if (!vm.hasOwnProperty('nics') || vm.nics.length === 0) {
                opts.log.warn(vm, 'vmapi.list: Got VM from VMAPI with no nics');
                continue;
            }

            var rvm = {
                enabled: vm.firewall_enabled ? true : false,
                ips: vm.nics.map(function (n) { return n.ip; }),
                owner_uuid: vm.owner_uuid,
                tags: {},
                uuid: vm.uuid
            };

            for (var t in vm.tags) {
                rvm.tags[t] = vm.tags[t];
            }

            rvms.push(rvm);
        }


        if (clientCreated) {
            opts.vmapi.client.close();
        }

        return callback(null, rvms);
    });
}


/**
 * Check if the rule in opts.value requires remote VMs (eg: this rule affects
 * local VMs, and the other side of the rule contains tags, vms, or all vms).
 *
 * Returns a payload appropriate for passing to fw.add() or fw.update().
 */
function populateRemoteVMs(opts, callback) {
    var filter = {};
    var owner = opts.value.owner_uuid;
    if (owner) {
        filter.owner_uuid = owner;
    }

    var payload = {
        req_id: opts.req_id,
        rules: [ opts.value ]
    };

    mod_vm.list(filter, function (err, vms) {
        if (err) {
            return callback(err);
        }

        payload.vms = vms;

        var vmsPayload = {
            req_id: opts.req_id,
            log: opts.log,
            payload: {
                vms: vms,
                rule: opts.value
            }
        };

        // Check if any local VMs are targeted by this rule
        fw.vms(vmsPayload, function (err2, matching) {
            if (err2) {
                return callback(err2);
            }

            if (!matching || matching.length === 0) {
                // No local VMs are targeted: return an empty object so the
                // caller knows not to do anything.
                return callback(null, {});
            }

            var remotePayload = {
                req_id: opts.req_id,
                log: opts.log,
                payload: payload
            };

            // Get any remote targets on the other side of the rule from
            // local VMs
            fw.remoteTargets(remotePayload, function (err3, targets) {
                if (err3) {
                    return callback(err3);
                }

                opts.log.debug({ rule: opts.value, targets: targets },
                    'Remote targets');

                if (prim.isEmpty(targets)) {
                    // No remote targets - no need to hit VMAPI
                    return callback(null, payload);
                }

                var toFilter = opts.cache.missing(owner, targets);
                if (prim.isEmpty(toFilter)) {
                    // All remote targets found in the cache - no need to hit
                    // VMAPI
                    opts.log.debug({ rule: opts.value },
                        'No missing targets: not fetching from VMAPI');
                    return callback(null, payload);
                }

                if (!owner) {
                    opts.log.debug({ rule: opts.value },
                        'No rule owner: not fetching VMs from VMAPI');
                    return callback(null, payload);
                }

                opts.log.debug({ rule: opts.value, missing: toFilter },
                    'Fetching missing targets from VMAPI');

                toFilter.owner_uuid = owner;
                toFilter.serverUUID = opts.config.serverUUID;
                // Finally, list VMs from VMAPI
                var listParams = {
                    config: opts.config,
                    log: opts.log,
                    filter: toFilter
                };

                listVMs(listParams, function (err4, rvms) {
                    if (err4) {
                        return callback(err4);
                    }

                    opts.cache.addResolveData(toFilter);

                    if (rvms.length !== 0) {
                        payload.remoteVMs = rvms;
                    }

                    opts.log.debug(rvms.map(function (v) { return v.uuid; }),
                        'Remote VMs retrieved from VMAPI');

                    return callback(null, payload);
                });
            });
        });
    });
}



module.exports = {
    list: listVMs,
    populateRemoteVMs: populateRemoteVMs
};
