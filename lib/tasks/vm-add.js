/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Add remote VM task
 */

var fw = require('../fw');
var mod_fwapi = require('../fwapi');
var mod_vm = require('../vm');



// --- Internal



/**
 * The VM is not local: add it if there are any non-global rules that would
 * apply to it
 */
function addRemoteVM(opts, vms, callback) {
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
}



// --- Exports



function addVM(opts, callback) {
    var filter = {};

    opts.log.debug({ value: opts.value }, 'addVM: entry');

    if (opts.value.owner_uuid) {
        filter.owner_uuid = opts.value.owner_uuid;
    }

    // XXX: validate properties

    mod_vm.list(opts.log, filter, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var localVM = mod_vm.isLocal(vms, opts.value);
        if (localVM) {
            opts.vms = vms;
            return mod_fwapi.resolveLocalVM(opts, localVM, callback);
        }

        return addRemoteVM(opts, vms, callback);
    });
}



module.exports = {
    run: addVM
};
