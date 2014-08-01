/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Functions for interacting with fwadm
 */

var fw = require('fw');
var fwLog = require('fw/lib/util/log');



// --- Internal



function logStart(opts, action, readOnly) {
    var log = opts.log;
    var payload = opts.payload;
    var oldVMs;

    if (payload.hasOwnProperty('vms')) {
        // Don't log full VM objects - just their UUIDs
        oldVMs = payload.vms;
        delete payload.vms;
        payload.vms = oldVMs.map(function (vm) {
            return vm.uuid;
        });
    }
    delete opts.log;
    delete payload.log;

    log.debug(opts, 'fw: %s', action);

    if (oldVMs) {
        payload.vms = oldVMs;
    }

    opts.log = log;

    if (opts.req_id && !payload.req_id) {
        payload.req_id = opts.req_id;
    }

    payload.log = fwLog.create({ action: action }, readOnly);
}


function run(opts, fn, readOnly, callback) {
    logStart(opts, fn, readOnly);

    fw[fn](opts.payload, function (err, res) {
        opts.log.debug({ result: res }, 'fw: %s: finish', fn);

        var loggingToFile = false;
        var streams = opts.payload.log.streams;
        streams.forEach(function (str) {
            if (str.type === 'file') {
                loggingToFile = true;
            }
        });

        if (!loggingToFile) {
            // Not logging to a file, so no need to flush the log
            return callback(err, res);
        }

        fwLog.flush(opts.payload.log, function () {
            opts.payload.log.streams.forEach(function (s) {
                s.stream.end();
            });

            return callback(err, res);
        });
    });
}



// --- Exports



/**
 * Add firewall data
 */
function add(opts, callback) {
    opts.payload.createdBy = 'fwapi';
    run(opts, 'add', false, callback);
}


/**
 * Delete firewall data
 */
function del(opts, callback) {
    run(opts, 'del', false, callback);
}


/**
 * Get rule
 */
function get(opts, callback) {
    run(opts, 'get', true, callback);
}


/**
 * Get remote VM
 */
function getRVM(opts, callback) {
    run(opts, 'getRVM', true, callback);
}


/**
 * List rules
 */
function list(opts, callback) {
    run(opts, 'list', true, callback);
}


/**
 * Get rules that apply to a remote VM
 */
function rvmRules(opts, callback) {
    run(opts, 'rvmRules', true, callback);
}


/**
 * Update firewall data
 */
function update(opts, callback) {
    opts.payload.createdBy = 'fwapi';
    // Allow "updating" rules that don't exist:
    opts.payload.allowAdds = true;
    run(opts, 'update', false, callback);
}


/**
 * Return remote (non-local) targets for a set of rules
 */
function remoteTargets(opts, callback) {
    run(opts, 'remoteTargets', false, callback);
}


/**
 * Return VM firewall status
 */
function status(opts, callback) {
    run(opts, 'status', true, callback);
}


/**
 * Get VMs that are affected by a rule
 */
function vms(opts, callback) {
    run(opts, 'vms', true, callback);
}



module.exports = {
    _setOldIPF: fw._setOldIPF,
    add: add,
    del: del,
    get: get,
    getRVM: getRVM,
    rvmRules: rvmRules,
    list: list,
    update: update,
    remoteTargets: remoteTargets,
    status: status,
    vms: vms,
    VM_FIELDS: fw.VM_FIELDS
};
