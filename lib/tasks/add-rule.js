/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Add firewall rule task
 */

var fw = require('/usr/fw/lib/fw');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');



function addRule(opts, callback) {
    opts.log.debug(opts.payload, 'addRule: entry');

    mod_vmapi.populateRemoteVMs(opts, function (err, addPayload) {
        if (err) {
            return callback(err);
        }

        if (prim.isEmpty(addPayload)) {
            opts.log.info(opts.payload,
                'rule did not affect any VMs: not adding');
            return callback();
        }

        addPayload.allowAdds = true;
        opts.log.debug(addPayload, 'adding rule');
        fw.add(addPayload, callback);
    });
}


module.exports = {
    run: addRule
};
