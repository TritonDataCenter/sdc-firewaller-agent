/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Update remote VM task
 */

var clone = require('clone');
var fw = require('../fw');
var mod_common = require('./vm-common');
var mod_fwapi = require('../fwapi');
var mod_vm = require('../vm');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');

var addRemoteVM = mod_common.addRemoteVM;
var hasNonGlobalRules = mod_common.hasNonGlobalRules;


// --- Internal

function fillRVM(opts, rvm) {
    var t;

    if (opts.value.hasOwnProperty('add_nics')) {
        rvm.nics = opts.value.add_nics;
    }

    if (!rvm.hasOwnProperty('ips')) {
        rvm.ips = [];
    }

    if (opts.value.hasOwnProperty('remove_ips') && rvm.ips) {
        rvm.ips = rvm.ips.filter(function (ip) {
            return (opts.value.remove_ips.indexOf(ip) === -1);
        });
    }

    if (!rvm.hasOwnProperty('tags')) {
        rvm.tags = {};
    }

    if (opts.value.hasOwnProperty('set_tags')) {
        for (t in opts.value.set_tags) {
            rvm.tags[t] = opts.value.set_tags[t];
        }
    }

    if (opts.value.hasOwnProperty('remove_tags')) {
        for (t in opts.value.remove_tags) {
            delete rvm.tags[opts.value.remove_tags[t]];
        }
    }

    if (prim.isEmpty(rvm.tags)) {
        delete rvm.tags;
    }

    return rvm;
}


/**
 * If a local VM changes properties, new rules may become applicable. Check
 * with FWAPI using its new properties, and then update its firewall.
 */
function updateLocalVM(opts, localVM, callback) {
    mod_fwapi.resolveLocalVM(opts, localVM, function (err) {
        if (err) {
            callback(err);
            return;
        }

        opts.log.info({ localVM: localVM }, 'updating local VM');
        fw.update({
            log: opts.log,
            payload: {
                localVMs: [ localVM ],
                vms: opts.vms
            }
        }, callback);
    });
}


/**
 * When a remote VM changes, determine if it's relevant to any local VMs,
 * and fetch its information if so.
 */
function updateRVM(opts, vms, callback) {
    var rvm_uuid = opts.value.uuid;
    var rvmPayload = {
        log: opts.log,
        req_id: opts.req_id,
        payload: { remoteVM: rvm_uuid }
    };

    fw.getRVM(rvmPayload, function (getErr, rvm) {
        if (getErr) {
            if (getErr.code !== 'ENOENT') {
                /* Unknown failure: abort  */
                callback(getErr);
            } else if (opts.value.owner_uuid === undefined) {
                /*
                 * RVM doesn't exist locally and an out-of-date VMAPI
                 * hasn't sent us the owner UUID, so we can't determine
                 * if the RVM needs to be saved locally: fetch the VM
                 * object from VMAPI, and then check if we need to
                 * save it.
                 */
                opts.log.warn('Update information for %s is missing '
                    + 'an owner_uuid: update VMAPI', rvm_uuid);
                mod_vmapi.get(opts, rvm_uuid, function (err3, nrvm) {
                    if (err3) {
                        callback(err3);
                        return;
                    }

                    var nopts = clone(opts, false, 1);
                    nopts.value = nrvm;
                    addRemoteVM(nopts, vms, callback);
                });
            } else {
                /*
                 * Check if this VM update would make this RVM relevant to
                 * any of the local VMs' rules. If so, fetch the VM object
                 * and save it locally.
                 */
                fw.rvmRules({
                    log: opts.log,
                    req_id: opts.req_id,
                    payload: {
                        vms: vms,
                        remoteVM: fillRVM(opts, {
                            owner_uuid: opts.value.owner_uuid,
                            uuid: rvm_uuid
                        })
                    }
                }, function (err3, rvmRules) {
                    if (err3 || !hasNonGlobalRules(rvmRules)) {
                        callback(err3);
                        return;
                    }

                    mod_vmapi.get(opts, rvm_uuid, function (err4, nrvm) {
                        if (err4) {
                            callback(err4);
                            return;
                        }

                        fw.add({
                            log: opts.log,
                            req_id: opts.req_id,
                            payload: {
                                remoteVMs: [ nrvm ],
                                vms: vms
                            }
                        }, function (err5, res) {
                            if (!err5) {
                                opts.cache.addVMs(opts.value.owner_uuid,
                                    [opts.value.uuid]);
                            }

                            opts.log.info(opts.value,
                                'Added remote VM "%s"', opts.value.uuid);
                            callback(err5, res);
                        });
                    });
                });
            }
        } else {
            /*
             * RVM already exists locally, so we'll just update it. It's
             * okay if this update makes it no longer relevant locally,
             * since we'll take care of garbage collecting it and any
             * other irrelevant VMs during the periodic "sync" task.
             */
            fw.update({
                log: opts.log,
                req_id: opts.req_id,
                payload: {
                    remoteVMs: [ fillRVM(opts, rvm) ],
                    vms: vms
                }
            }, callback);
        }
    });
}


// --- Exports

/*
 * vm-update task entry point
 */
function updateVM(opts, callback) {
    var filter = {};

    opts.log.debug(opts.value, 'updateVM: entry');

    if (opts.value.owner_uuid) {
        filter.owner_uuid = opts.value.owner_uuid;
    }

    if (!opts.value.uuid) {
        opts.log.warn(opts.value, 'Remote VM missing UUID: not updating');
        callback();
        return;
    }

    // XXX: validate other properties

    mod_vm.list(opts.log, filter, function (err, vms) {
        if (err) {
            callback(err);
            return;
        }

        var localVM = mod_vm.isLocal(vms, opts.value);
        if (localVM) {
            opts.vms = vms;
            updateLocalVM(opts, localVM, callback);
            return;
        }

        updateRVM(opts, vms, callback);
    });
}


module.exports = {
    run: updateVM
};
