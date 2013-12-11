/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Add Remote VM task
 */

var fw = require('/usr/fw/lib/fw');
var mod_vm = require('../vm');



function addVM(opts, callback) {
    var filter = {};

    opts.log.debug(opts.value, 'addVM: entry');

    if (opts.value.owner_uuid) {
        filter.owner_uuid = opts.value.owner_uuid;
    }

    // XXX: validate properties

    mod_vm.list(filter, function (err, vms) {
        if (mod_vm.isLocal(vms, opts.value)) {
            opts.log.info(opts.value,
                'Remote VM "%s" exists on this server: not adding',
                opts.payload.uuid);
            return callback();
        }

        var payload = {
            remoteVMs: [ opts.value ],
            vms: vms
        };

        fw.rvmRules({ vms: vms, remoteVM: opts.value },
            function (err2, rules) {
            if (err2) {
                return callback(err2);
            }

            if (rules.length === 0) {
                opts.log.info(opts.value,
                    'Remote VM "%s" is not the target of any rules: not adding',
                    opts.value.uuid);
                return callback();
            }

            fw.add(payload, function (err3, res) {
                if (!err3) {
                    opts.cache.addVMs(opts.value.owner_uuid, [opts.value]);
                }

                opts.log.info(opts.value,
                    'Added remote VM "%s"', opts.value.uuid);
                return callback(err3, res);
            });
        });
    });
}


module.exports = {
    run: addVM
};
