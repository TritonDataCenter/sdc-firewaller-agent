/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2016, Joyent, Inc.
 */

/*
 * Common routines for managing VMs.
 */

'use strict';

var fw = require('../fw');


// --- Exports

/**
 * Check if an array of rules contains any non-global rules
 */
function hasNonGlobalRules(rules) {
    return rules.some(function (rule) {
        return !rule.global;
    });
}


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

    fw.rvmRules(rulesPayload, function (rvmErr, rvmRules) {
        if (rvmErr) {
            callback(rvmErr);
            return;
        }

        if (!hasNonGlobalRules(rvmRules)) {
            opts.log.info(
                { rvm: opts.value },
                'Remote VM "%s" is not the target of any ' +
                'non-global rules: not adding', opts.value.uuid);
            callback();
            return;
        }

        var addPayload = {
            log: opts.log,
            req_id: opts.req_id,
            payload: {
                remoteVMs: [ opts.value ],
                vms: vms
            }
        };

        fw.add(addPayload, function (addErr, res) {
            if (!addErr) {
                opts.cache.addVMs(opts.value.owner_uuid, [opts.value.uuid]);
                opts.log.info(opts.value,
                    'Added remote VM "%s"', opts.value.uuid);
            }

            callback(addErr, res);
        });
    });
}


module.exports = {
    addRemoteVM: addRemoteVM,
    hasNonGlobalRules: hasNonGlobalRules
};
