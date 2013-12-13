/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Functions for interacting with fwadm
 */

var fw = require('/usr/fw/lib/fw');



// --- Internal



function logPayload(opts, action) {
    var log = opts.log;
    var payload = opts.payload;
    var vms;

    if (payload.hasOwnProperty('vms')) {
        vms = payload.vms;
        delete payload.vms;
    }
    delete opts.log;

    log.debug(opts, 'fw: %s', action);

    if (vms) {
        payload.vms = vms;
    }

    opts.log = log;
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
 * Update firewall data
 */
function update(opts, callback) {
    opts.payload.createdBy = 'fwapi';
    // Allow "updating" rules that don't exist:
    opts.payload.allowAdds = true;

    logPayload(opts, 'update');
    fw.update(opts.payload, callback);
}



module.exports = {
    add: add,
    list: fw.list,
    update: update
};
