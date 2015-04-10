/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Add firewall rule task
 */

var fw = require('../fw');
var mod_vmapi = require('../vmapi');
var prim = require('jsprim');



function addRule(opts, callback) {
    opts.log.debug({ value: opts.value }, 'addRule: entry');

    var force = opts.value.force || false;
    opts.force = opts.value.force;

    if (!opts.value.enabled) {
        opts.log.info({ value: opts.value },
            'rule was disabled: not adding');
        return callback();
    }

    mod_vmapi.populateRemoteVMs(opts, function (err, addPayload) {
        if (err) {
            return callback(err);
        }

        if (!force && prim.isEmpty(addPayload)) {
            opts.log.info({ value: opts.value },
                'rule did not affect any VMs: not adding');
            return callback();
        }

        fw.add({
            log: opts.log,
            payload: addPayload,
            req_id: opts.req_id
        }, callback);
    });
}



module.exports = {
    run: addRule
};
