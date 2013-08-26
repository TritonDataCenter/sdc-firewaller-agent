/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Add Remote VM task
 */

var fw = require('/usr/fw/lib/fw');
var mod_vm = require('../vm');



function addVM(opts, callback) {
    var filter = {};

    opts.log.debug(opts.payload, 'addVM: entry');

    if (opts.payload.owner_uuid) {
        filter.owner_uuid = opts.payload.owner_uuid;
    }

    // XXX: validate properties

    mod_vm.list(filter, function (err, vms) {
        if (mod_vm.isLocal(vms, opts.payload)) {
            opts.log.info(opts.payload,
                'Remote VM "%s" exists on this server: not adding',
                opts.payload.uuid);
            return callback();
        }

        var payload = {
            remoteVMs: [ opts.payload ],
            vms: vms
        };

        fw.rvmRules({ vms: vms, remoteVM: opts.payload },
            function (err2, rules) {
            if (err2) {
                return callback(err2);
            }

            if (rules.length === 0) {
                opts.log.info(opts.payload,
                    'Remote VM "%s" is not the target of any rules: not adding',
                    opts.payload.uuid);
                return callback();
            }

            fw.add(payload, function (err3, res) {
                if (!err3) {
                    opts.cache.addVMs(opts.payload.owner_uuid, [opts.payload]);
                }

                opts.log.info(opts.payload,
                    'Added remote VM "%s"', opts.payload.uuid);
                return callback(err3, res);
            });
        });
    });
}


module.exports = {
    run: addVM
};
