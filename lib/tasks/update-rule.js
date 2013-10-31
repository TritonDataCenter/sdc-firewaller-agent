/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Update firewall rule task
 */

var fw = require('/usr/fw/lib/fw');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');



function updateRule(opts, callback) {
    opts.log.debug(opts.payload, 'Updating rule');

    mod_vmapi.populateRemoteVMs(opts, function (err, updatePayload) {
        if (err) {
            return callback(err);
        }

        if (prim.isEmpty(updatePayload)) {
            opts.log.info(opts.payload,
                'rule did not affect any VMs: not adding');
            return callback();
        }

        updatePayload.allowAdds = true;
        updatePayload.createdBy = 'fwapi';
        fw.update(updatePayload, callback);
    });
}


module.exports = {
    run: updateRule
};
