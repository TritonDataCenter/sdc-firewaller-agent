/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Update firewall rule task
 */

var fw = require('../fw');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');



function updateRule(opts, callback) {
    opts.log.debug(opts.value, 'Updating rule');

    mod_vmapi.populateRemoteVMs(opts, function (err, updatePayload) {
        if (err) {
            return callback(err);
        }

        if (prim.isEmpty(updatePayload)) {
            opts.log.info(opts.value,
                'rule did not affect any VMs: not updating');
            return callback();
        }

        fw.update({
            log: opts.log,
            payload: updatePayload,
            req_id: opts.req_id
        }, callback);
    });
}


module.exports = {
    run: updateRule
};
