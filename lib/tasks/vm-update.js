/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Update Remote VM task
 */

var fw = require('/usr/fw/lib/fw');
var mod_vm = require('../vm');
var prim = require('jsprim');



function updateVM(opts, callback) {
    var filter = {};

    opts.log.debug(opts.payload, 'updateVM: entry');

    if (opts.payload.owner_uuid) {
        filter.owner_uuid = opts.payload.owner_uuid;
    }

    if (!opts.payload.uuid) {
        opts.log.warn(opts.payload, 'Remote VM missing UUID: not updating');
        return callback();
    }

    // XXX: validate other properties

    mod_vm.list(filter, function (err, vms) {
        if (mod_vm.isLocal(vms, opts.payload)) {
            opts.log.info(opts.payload,
                'Remote VM "%s" exists on this server: not updating',
                opts.payload.uuid);
            return callback();
        }

        fw.getRVM({ remoteVM: opts.payload.uuid }, function (err2, rvm) {
            if (err2) {
                return callback(err2);
            }

            var t;

            if (opts.payload.hasOwnProperty('add_nics')) {
                rvm.nics = opts.payload.add_nics;
            }

            if (opts.payload.hasOwnProperty('remove_ips') && rvm.ips) {
                rvm.ips = rvm.ips.filter(function (ip) {
                    return opts.payload.remove_ips.indexOf(ip) === -1;
                });
            }

            if (opts.payload.hasOwnProperty('remove_tags')) {
                for (t in opts.payload.remove_tags) {
                    delete rvm.tags[t];
                }
            }

            if (!rvm.hasOwnProperty('tags')) {
                rvm.tags = {};
            }

            if (opts.payload.hasOwnProperty('set_tags')) {
                for (t in opts.payload.set_tags) {
                    rvm.tags[t] = opts.payload.set_tags[t];
                }
            }

            if (opts.payload.hasOwnProperty('remove_tags')) {
                for (t in opts.payload.remove_tags) {
                    delete rvm.tags[t];
                }
            }

            if (prim.isEmpty(rvm.tags)) {
                delete rvm.tags;
            }

            var payload = {
                remoteVMs: [ rvm ],
                vms: vms
            };

            fw.update(payload, callback);
        });
    });
}


module.exports = {
    run: updateVM
};
