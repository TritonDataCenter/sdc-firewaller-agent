/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Functions for interacting with fwadm
 */

'use strict';

var clone = require('clone');
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

    // Log a clone of opts, rather than the original: this is because we're
    // about to re-add log and vms back to opts (which are huge).  If we were
    // just logging to a file right now, this would be fine.  However, this
    // code path is also called by request handlers in endpoints/, and the
    // logger passed in there has a RequestCaptureStream raw stream. This can
    // cause the following behaviour:
    //
    // 1) We do the log.debug() below: this logs opts to RequestCaptureStream's
    //    ring buffer. Nothing is stringified here - the buffer just has a
    //    reference to opts.
    // 2) log and vms are added back to opts
    // 3) We log a bunch more: all of these log lines go to the ringbuffer
    // 4) We do a log.error(): this causes all of the log entries for that
    //    request to be dumped out of the ringbuffer to file. The entry for
    //    the log.debug() in step 1 has the current reference to opts, which
    //    contains both log and vms. We therefore dump a copy of the ringbuffer
    //    object to the log, which makes debugging using these logs
    //    incredibly difficult and misleading.
    //
    // ... and that's why we're cloning opts here.
    var toLog = clone(opts);
    log.debug(toLog, 'fw: %s', action);

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
        if (err) {
            opts.log.error(err, 'fw: %s: finish', fn);

        } else {
            opts.log.debug({ result: res }, 'fw: %s: finish', fn);
        }

        var loggingToFile = false;
        var streams = opts.payload.log.streams;
        streams.forEach(function (str) {
            if (str.type === 'file') {
                loggingToFile = true;
            }
        });

        if (!loggingToFile) {
            // Not logging to a file, so no need to flush the log
            callback(err, res);
            return;
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
 * List remote VMs
 */
function listRVMs(opts, callback) {
    run(opts, 'listRVMs', true, callback);
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
    listRVMs: listRVMs,
    update: update,
    remoteTargets: remoteTargets,
    status: status,
    vms: vms,
    VM_FIELDS: fw.VM_FIELDS
};
