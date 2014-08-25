/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Update remote VM task
 */

var fw = require('../fw');
var mod_fwapi = require('../fwapi');
var mod_vm = require('../vm');
var prim = require('jsprim');



function updateVM(opts, callback) {
    var filter = {};

    opts.log.debug(opts.value, 'updateVM: entry');

    if (opts.value.owner_uuid) {
        filter.owner_uuid = opts.value.owner_uuid;
    }

    if (!opts.value.uuid) {
        opts.log.warn(opts.value, 'Remote VM missing UUID: not updating');
        return callback();
    }

    // XXX: validate other properties

    mod_vm.list(opts.log, filter, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var localVM = mod_vm.isLocal(vms, opts.value);
        if (localVM) {
            opts.vms = vms;
            return mod_fwapi.resolveLocalVM(opts, localVM, callback);
        }

        var rvmPayload = {
            log: opts.log,
            req_id: opts.req_id,
            payload: { remoteVM: opts.value.uuid }
        };

        fw.getRVM(rvmPayload, function (err2, rvm) {
            if (err2) {
                if (err2.code === 'ENOENT') {
                    opts.log.info(opts.value,
                        'Remote VM "%s" does not exist on this server: ' +
                        'not updating', opts.value.uuid);
                    return callback();
                }
                return callback(err2);
            }

            var t;

            if (opts.value.hasOwnProperty('add_nics')) {
                rvm.nics = opts.value.add_nics;
            }

            if (opts.value.hasOwnProperty('remove_ips') && rvm.ips) {
                rvm.ips = rvm.ips.filter(function (ip) {
                    return opts.value.remove_ips.indexOf(ip) === -1;
                });
            }

            if (opts.value.hasOwnProperty('remove_tags')) {
                for (t in opts.value.remove_tags) {
                    delete rvm.tags[t];
                }
            }

            if (!rvm.hasOwnProperty('tags')) {
                rvm.tags = {};
            }

            if (opts.value.hasOwnProperty('set_tags')) {
                for (t in opts.value.set_tags) {
                    rvm.tags[t] = opts.value.set_tags[t];
                }
            }

            if (opts.value.hasOwnProperty('remove_tags')) {
                for (t in opts.value.remove_tags) {
                    delete rvm.tags[t];
                }
            }

            if (prim.isEmpty(rvm.tags)) {
                delete rvm.tags;
            }

            var updatePayload = {
                log: opts.log,
                req_id: opts.req_id,
                payload: {
                    remoteVMs: [ rvm ],
                    vms: vms
                }
            };

            fw.update(updatePayload, callback);
        });
    });
}


module.exports = {
    run: updateVM
};
