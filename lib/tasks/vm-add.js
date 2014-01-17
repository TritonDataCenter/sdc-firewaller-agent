/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Add remote VM task
 */

var fw = require('../fw');
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
                opts.value.uuid);
            return callback();
        }

        var rulesPayload = {
            log: opts.log,
            req_id: opts.req_id,
            payload: {
                vms: vms,
                remoteVM: opts.value
            }
        };

        fw.rvmRules(rulesPayload, function (err2, rvmRules) {
            if (err2) {
                return callback(err2);
            }

            var globalRules = 0;
            var nonGlobalRules = 0;

            rvmRules.forEach(function (rvmRule) {
                if (rvmRule.global) {
                    globalRules++;
                } else {
                    nonGlobalRules++;
                }
            });

            if (nonGlobalRules === 0) {
                opts.log.info(
                    { rvm: opts.value, globalRules: globalRules },
                    'Remote VM "%s" is not the target of any ' +
                    'non-global rules: not adding', opts.value.uuid);
                return callback();
            }

            var addPayload = {
                log: opts.log,
                req_id: opts.req_id,
                payload: {
                    remoteVMs: [ opts.value ],
                    vms: vms
                }
            };

            fw.add(addPayload, function (err3, res) {
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
