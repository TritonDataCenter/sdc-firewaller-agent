/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Delete firewall rule task
 */

var fw = require('/usr/fw/lib/fw');
var mod_vm = require('../vm');



function delRule(opts, callback) {
    opts.log.debug(opts.payload, 'Deleting rule');
    var filter = {};
    if (opts.payload.owner_uuid) {
        filter.owner_uuid = opts.payload.owner_uuid;
    }

    mod_vm.list(filter, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var delPayload = {
            req_id: opts.req_id,
            uuids: [ opts.payload.uuid ],
            vms: vms
        };

        fw.del(delPayload, function (err2, res2) {
            if (err2) {
                return callback(err2);
            }

            // XXX: need to remove remote VMs from the cache if they're
            // unused

            callback(null, res2);
        });
    });
}


module.exports = {
    run: delRule
};
