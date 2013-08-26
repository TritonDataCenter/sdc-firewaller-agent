/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Functions for interacting with VM.js
 */

var fw = require('/usr/fw/lib/fw');
var VM = require('/usr/vm/node_modules/VM');



function isLocal(vms, vm) {
    for (var v in vms) {
        if (vms[v].uuid == vm.uuid) {
            return true;
        }
    }

    return false;
}


function listVMs(filter, callback) {
    if (!callback) {
        callback = filter;
        filter = {};
    }

    return VM.lookup(filter, { fields: fw.VM_FIELDS }, callback);
}



module.exports = {
    isLocal: isLocal,
    list: listVMs
};
