/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Functions for interacting with FWAPI
 */

var assert = require('assert-plus');
var mod_vmapi = require('./vmapi');
var prim = require('jsprim');
var fw = require('./fw');
var FWAPI = require('sdc-clients').FWAPI;



// --- Exports



/**
 * Populated opts.resolved.{rules,vms} with VMs and rules
 */
function addResolvedToOpts(opts, vms, rules) {
    if (!opts.hasOwnProperty('resolved')) {
        opts.resolved = {
            rules: {},
            vms: {}
        };
    }

    if (vms) {
        for (var v in vms) {
            opts.resolved.vms[vms[v].uuid] = vms[v];
        }
    }

    if (rules) {
        for (var r in rules) {
            opts.resolved.rules[rules[r].uuid] = rules[r];
        }
    }
}


function buildResolvePayload(opts) {
    var owner;
    var ownerVMs = {};
    var t;
    var vms = opts.vms;

    if (vms.length === 0) {
        opts.log.warn('buildResolvePayload: no VMs to resolve');
    }

    for (var v in vms) {
        var vm = vms[v];
        if (opts.log.trace()) {
            opts.log.trace({ vm: vm }, 'buildResolvePayload: VM');
        }

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

    return payloads;
}


function createClient(opts) {
    assert.object(opts.config, 'opts.config');
    assert.object(opts.config.fwapi, 'opts.config.fwapi');
    assert.string(opts.config.fwapi.host, 'opts.config.fwapi.host');

    return new FWAPI({ url: 'http://' + opts.config.fwapi.host });
}


function resolve(opts, payload, callback) {
    opts.log.debug(payload, 'resolving data from FWAPI');

    opts.fwapi.post('/resolve', payload, function (err, resolved) {
        if (err) {
            // XXX: retry?
            return callback(err);
        }

        if (!resolved || prim.isEmpty(resolved) || !resolved.rules ||
            resolved.rules.length === 0) {
            opts.log.debug({ payload: payload, resolved: resolved },
                'No resolve data: returning');
            return callback();
        }

        opts.log.debug({ resolved: resolved }, 'retrieved FWAPI resolve data');

        opts.cache.addResolveData(resolved);
        opts.filter = resolved;
        opts.filter.serverUUID = opts.config.serverUUID;

        mod_vmapi.list(opts, function (err2, vms) {
            if (err2) {
                return callback(err2);
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
                    return callback(err3);
                }

                addResolvedToOpts(opts, vms, resolved.rules);
                opts.log.debug(res, 'Updated rules for owner_uuid="%s"',
                    resolved.owner_uuid);
                return callback(null, res);
            });
        });
    });
}


/**
 * A local VM has been added: resolve any rules and remote VMs that it needs
 * from FWAPI / VMAPI.
 */
function resolveLocalVM(opts, vm, callback) {
    if (!vm.hasOwnProperty('firewall_enabled') || !vm.firewall_enabled ||
        vm.state === 'failed') {
        opts.log.info({ uuid: vm.uuid, vm: vm },
            'Local VM does not need resolving');
        return callback();
    }

    var payloads = buildResolvePayload({
        log: opts.log,
        vms: [ vm ]
    });

    if (!payloads || payloads.length === 0) {
        opts.log.warn('No resolve payloads for VM "%s"', vm.uuid);
        return callback();
    }

    opts.fwapi = createClient(opts);

    resolve(opts, payloads[0], function (err, res) {
        if (err) {
            opts.fwapi.client.close();
            return callback(err);
        }

        opts.log.info('resolved data for VM "%s"', vm.uuid);
        opts.fwapi.client.close();
        return callback();
    });
}





module.exports = {
    addResolvedToOpts: addResolvedToOpts,
    buildResolvePayload: buildResolvePayload,
    createClient: createClient,
    resolve: resolve,
    resolveLocalVM: resolveLocalVM
};
