/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Delete remote VM task
 */

var fw = require('../fw');
var mod_vm = require('../vm');
var prim = require('jsprim');



function deleteVM(opts, callback) {
    var filter = {};
    opts.log.debug(opts.value, 'deleteVM: entry');

    if (opts.value.owner_uuid) {
        filter.owner_uuid = opts.value.owner_uuid;
    }

    if (!opts.value.uuid) {
        opts.log.warn(opts.value, 'Remote VM missing UUID: not deleting');
        return callback();
    }

    // XXX: validate other properties

    mod_vm.list(opts.log, filter, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var payload = {
            rvmUUIDs: [ opts.value.uuid ],
            vms: vms
        };

        fw.del({
            log: opts.log,
            payload: payload,
            req_id: opts.req_id
        }, callback);
    });
}


module.exports = {
    run: deleteVM
};
