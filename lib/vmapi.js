/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Functions for interacting with VMAPI
 */

'use strict';

var assert = require('assert-plus');
var fw = require('./fw');
var mod_vm = require('./vm');
var pred = require('./pred');
var prim = require('jsprim');
var VMAPI = require('sdc-clients').VMAPI;



// --- Internal



function buildRVM(vm) {
    var rvm = {
        enabled: !!vm.firewall_enabled,
        ips: vm.nics.map(function (n) { return n.ip; }),
        owner_uuid: vm.owner_uuid,
        tags: {},
        uuid: vm.uuid
    };

    for (var t in vm.tags) {
        rvm.tags[t] = vm.tags[t];
    }

    return rvm;
}



// --- Exports



function createClient(opts) {
    return new VMAPI({ url: 'http://' + opts.config.vmapi.host });
}


function getVM(opts, vm_uuid, callback) {
    var clientCreated = false;

    assert.object(opts, 'opts');
    assert.string(vm_uuid, 'vm_uuid');
    assert.func(callback, 'callback');

    if (!opts.vmapi) {
        opts.vmapi = createClient(opts);
        clientCreated = true;
    }

    var getParams = {
        path: '/vms/' + vm_uuid
    };

    if (opts.req_id) {
        getParams.headers = { 'x-request-id': opts.req_id };
    }

    opts.log.debug('vmapi.get: Getting VM %s', vm_uuid);

    opts.vmapi.get(getParams, function (err, vm) {
        if (clientCreated) {
            opts.vmapi.client.close();
        }

        if (err) {
            callback(err);
            return;
        }

        if (!vm.hasOwnProperty('nics') || vm.nics.length === 0) {
            opts.log.warn(vm, 'vmapi.get: Got VM from VMAPI with no nics');
            callback();
            return;
        }

        callback(null, buildRVM(vm));
    });
}


function listVMs(opts, callback) {
    var filter = opts.filter;
    var clientCreated = false;
    var predicate;

    if (!filter.tags && !filter.vms && !filter.allVMs) {
        opts.log.debug(
            'vmapi.list: No tags, vms or allVMs for owner "%s": not getting',
            opts.filter.owner_uuid);
        callback();
        return;
    }

    var tags = filter.tags || {};
    var vmsToFind = filter.vms || [];
    if (prim.isEmpty(tags) && vmsToFind.length === 0 && !filter.allVMs) {
        opts.log.debug('vmapi.list: No tags or VMs to get for owner "%s"',
            opts.filter.owner_uuid);
        callback();
        return;
    }

    predicate = pred.create(opts.filter);

    if (!opts.vmapi) {
        opts.vmapi = createClient(opts);
        clientCreated = true;
    }

    var getParams = {
        path: '/vms',
        query: { predicate: JSON.stringify(predicate) }
    };

    if (opts.req_id) {
        getParams.headers = { 'x-request-id': opts.req_id };
    }

    opts.log.debug({ params: getParams, predicate: predicate }, 'listing VMs');

    opts.vmapi.get(getParams, function (err, vms) {
        if (clientCreated) {
            opts.vmapi.client.close();
        }

        if (err) {
            callback(err);
            return;
        }

        var rvms = [];
        for (var v in vms) {
            var vm = vms[v];

            // Skip VMs that are on this server
            if (vm.hasOwnProperty('server_uuid') &&
                vm.server_uuid === opts.filter.serverUUID) {
                continue;
            }

            if (!vm.hasOwnProperty('nics') || vm.nics.length === 0) {
                opts.log.warn(vm, 'vmapi.list: Got VM from VMAPI with no nics');
                continue;
            }

            rvms.push(buildRVM(vm));
        }

        callback(null, rvms);
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
    var force = opts.force || false;
    var owner = opts.value.owner_uuid;
    if (owner) {
        filter.owner_uuid = owner;
    }

    var payload = {
        req_id: opts.req_id,
        rules: [ opts.value ]
    };

    mod_vm.list(opts.log, filter, function (err, vms) {
        if (err) {
            callback(err);
            return;
        }

        payload.vms = vms;

        var vmsPayload = {
            req_id: opts.req_id,
            log: opts.log,
            payload: {
                includeDisabled: false,
                vms: vms,
                rule: opts.value
            }
        };

        // Check if any local VMs are targeted by this rule
        fw.vms(vmsPayload, function (err2, matching) {
            if (err2) {
                callback(err2);
                return;
            }

            if (!force && (!matching || matching.length === 0)) {
                // No local VMs are targeted: return an empty object so the
                // caller knows not to do anything.
                callback(null, {});
                return;
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
                    callback(err3);
                    return;
                }

                opts.log.debug({ rule: opts.value, targets: targets },
                    'Remote targets');

                if (prim.isEmpty(targets)) {
                    // No remote targets - no need to hit VMAPI
                    callback(null, payload);
                    return;
                }

                var toFilter = opts.cache.missing(owner, targets);
                if (prim.isEmpty(toFilter)) {
                    // All remote targets found in the cache - no need to hit
                    // VMAPI
                    opts.log.debug({ rule: opts.value },
                        'No missing targets: not fetching from VMAPI');
                    callback(null, payload);
                    return;
                }

                if (!owner) {
                    opts.log.debug({ rule: opts.value },
                        'No rule owner: not fetching VMs from VMAPI');
                    callback(null, payload);
                    return;
                }

                opts.log.debug({ rule: opts.value, missing: toFilter },
                    'Fetching missing targets from VMAPI');

                toFilter.owner_uuid = owner;
                toFilter.serverUUID = opts.config.serverUUID;
                // Finally, list VMs from VMAPI
                var listParams = {
                    config: opts.config,
                    log: opts.log,
                    filter: toFilter,
                    req_id: opts.req_id
                };

                listVMs(listParams, function (err4, rvms) {
                    if (err4) {
                        return callback(err4);
                    }

                    opts.cache.addResolveData(toFilter);

                    if (rvms.length !== 0) {
                        payload.remoteVMs = rvms;
                    }

                    opts.log.debug(
                        { vms: rvms.map(function (v) { return v.uuid; }) },
                        'Remote VMs retrieved from VMAPI');

                    return callback(null, payload);
                });
            });
        });
    });
}



module.exports = {
    createClient: createClient,
    get: getVM,
    list: listVMs,
    populateRemoteVMs: populateRemoteVMs
};
