/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Add firewall rule task
 */

var fw = require('../fw');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');



function addRule(opts, callback) {
    opts.log.debug(opts.value, 'addRule: entry');

    mod_vmapi.populateRemoteVMs(opts, function (err, addPayload) {
        if (err) {
            return callback(err);
        }

        if (prim.isEmpty(addPayload)) {
            opts.log.info(opts.value,
                'rule did not affect any VMs: not adding');
            return callback();
        }

        fw.add({ log: opts.log, payload: addPayload }, callback);
    });
}



module.exports = {
    run: addRule
};
