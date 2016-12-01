/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Functions for interacting with vmadm
 */

'use strict';

var fw = require('./fw');
var execFile = require('child_process').execFile;


var VMADM = '/usr/sbin/vmadm';



function isLocal(vms, vm) {
    for (var v in vms) {
        if (vms[v].uuid === vm.uuid) {
            return vms[v];
        }
    }

    return null;
}


function listVMs(log, filter, callback) {
    if (!callback) {
        callback = filter;
        filter = {};
    }

    var args = ['lookup', '-j', '-o'].concat(fw.VM_FIELDS.join(','));
    for (var k in filter) {
        args.push(k + '=' + filter[k]);
    }

    return execFile(VMADM, args, { maxBuffer: 32 * 1024 * 1024 },
        function _afterVmadmExec(err, stdout, stderr) {

        if (err) {
            log.error({ err: err, stdout: stdout, stderr: stderr },
                'vmadm list error');
            err.stdout = stdout;
            err.stderr = stderr;
            return callback(err);
        }

        var vms;

        try {
            vms = JSON.parse(stdout);
        } catch (jsonErr) {
            jsonErr.stdout = stdout;
            return callback(jsonErr);
        }

        return callback(null, vms);
    });
}



module.exports = {
    isLocal: isLocal,
    list: listVMs
};
