/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Functions for interacting with fwadm
 */

var fw = require('fw');



// --- Internal



function logPayload(opts, action) {
    var log = opts.log;
    var payload = opts.payload;
    var oldVMs;

    if (payload.hasOwnProperty('vms')) {
        oldVMs = payload.vms;
        delete payload.vms;
    }
    delete opts.log;

    log.debug(opts, 'fw: %s', action);

    if (oldVMs) {
        payload.vms = oldVMs;
    }

    opts.log = log;

    if (opts.req_id && !payload.req_id) {
        payload.req_id = opts.req_id;
    }
}



// --- Exports



/**
 * Add firewall data
 */
function add(opts, callback) {
    opts.payload.createdBy = 'fwapi';

    logPayload(opts, 'add');
    fw.add(opts.payload, callback);
}


/**
 * Delete firewall data
 */
function del(opts, callback) {
    logPayload(opts, 'del');
    fw.del(opts.payload, callback);
}


/**
 * Get remote VM
 */
function getRVM(opts, callback) {
    logPayload(opts, 'getRVM');
    fw.getRVM(opts.payload, callback);
}


/**
 * List rules
 */
function list(opts, callback) {
    logPayload(opts, 'list');
    fw.list(opts.payload, callback);
}


/**
 * Get rules that apply to a remote VM
 */
function rvmRules(opts, callback) {
    logPayload(opts, 'rvmRules');
    fw.rvmRules(opts.payload, callback);
}


/**
 * Update firewall data
 */
function update(opts, callback) {
    opts.payload.createdBy = 'fwapi';
    // Allow "updating" rules that don't exist:
    opts.payload.allowAdds = true;

    logPayload(opts, 'update');
    fw.update(opts.payload, callback);
}


/**
 * Return remote (non-local) targets for a set of rules
 */
function remoteTargets(opts, callback) {
    logPayload(opts, 'remoteTargets');
    fw.remoteTargets(opts.payload, callback);
}


/**
 * Get VMs that are affected by a rule
 */
function vms(opts, callback) {
    logPayload(opts, 'vms');
    fw.vms(opts.payload, callback);
}



module.exports = {
    _setOldIPF: fw._setOldIPF,
    add: add,
    del: del,
    getRVM: getRVM,
    rvmRules: rvmRules,
    list: list,
    update: update,
    remoteTargets: remoteTargets,
    vms: vms,
    VM_FIELDS: fw.VM_FIELDS
};
