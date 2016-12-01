/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Update firewall rule task
 */

'use strict';

var fw = require('../fw');
var mod_vm = require('../vm');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');



function updateRule(opts, callback) {
    opts.log.debug({ value: opts.value }, 'Updating rule');

    mod_vmapi.populateRemoteVMs(opts, function (err, updatePayload) {
        if (err) {
            callback(err);
            return;
        }

        if (!prim.isEmpty(updatePayload)) {
            // Rule affects local VMs, so update it regardless of
            // whether or not it actually exists
            fw.update({
                log: opts.log,
                payload: updatePayload,
                req_id: opts.req_id
            }, callback);
            return;
        }

        fw.get({
            log: opts.log,
            payload: { uuid: opts.value.uuid },
            req_id: opts.req_id
        }, function (getErr, res) {
            if (getErr) {
                if (getErr.code === 'ENOENT') {
                    opts.log.info(opts.value, 'rule did not affect any VMs '
                        + 'and did not exist: not updating');
                    callback();
                    return;
                }

                callback(getErr);
                return;
            }

            opts.log.info(opts.value,
                'rule did not affect any VMs but exists: updating');

            var filter = { owner_uuid: opts.value.owner_uuid };
            mod_vm.list(opts.log, filter, function (listErr, vms) {
                if (listErr) {
                    return callback(listErr);
                }

                return fw.update({
                    log: opts.log,
                    payload: {
                        rules: [ opts.value ],
                        vms: vms
                    },
                    req_id: opts.req_id
                }, callback);
            });
        });
    });
}


module.exports = {
    run: updateRule
};
