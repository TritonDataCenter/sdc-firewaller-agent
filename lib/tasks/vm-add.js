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

'use strict';

var mod_fwapi = require('../fwapi');
var mod_vm = require('../vm');

var addRemoteVM = require('./vm-common').addRemoteVM;


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
