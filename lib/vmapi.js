/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Functions for interacting with VMAPI
 */

var fw = require('/usr/fw/lib/fw');
var mod_vm = require('./vm');
var prim = require('jsprim');
var util = require('util');
var VMAPI = require('sdc-clients').VMAPI;



// --- Internal



/**
 * Returns an LDAP filter suitable for passing to VMAPI's listVMs endpoint
 */
function vmFilter(data) {
    if (data.allVMs) {
        return '(&' +
            '(owner_uuid=' + data.owner_uuid + ')' +
            '(!(server_uuid=' + data.serverUUID + '))' +
            ')';
    }

    var filter = [];
    var t;
    var tags = data.tags || {};
    var v;
    var vms = data.vms || [];

    for (t in tags) {
        var vals = util.isArray(tags[t]) ? tags[t] : [ tags[t] ];
        for (v in vals) {
            filter.push('(tags=*' + t + '='
                + (vals[v] !== true ? vals[v] : '') + '*)');
        }
    }

    vms.forEach(function (vm) {
        filter.push('(uuid=' + vm + ')');
    });

    if (filter.length > 1) {
        filter = ['(|'].concat(filter).concat(')');
    }

    // Don't get data for VMs in a state where they have no IPs: destroyed,
    // failed, provisioning
    filter.unshift('(&');
    filter.push('(!(state=destroyed))');
    filter.push('(!(state=failed))');
    filter.push('(!(state=provisioning))');
    filter.push('(owner_uuid=' + data.owner_uuid + ')');
    filter.push('(!(server_uuid=' + data.serverUUID + '))');
    filter.push(')');

    return filter.join('');
}



// --- Exports



function listVMs(opts, callback) {
    var data = opts.data;
    var clientCreated = false;

    if (!opts.vmapi) {
        opts.vmapi = new VMAPI({ url: 'http://' + opts.config.vmapi.host });
        clientCreated = true;
    }

    if (!data.tags && ! data.vms && !data.allVMs) {
        opts.log.debug(
            'No tags, vms or allVMs for owner "%s": not getting VMs',
            opts.data.owner_uuid);
        return callback();
    }

    var tags = data.tags || {};
    var vmsToFind = data.vms || [];
    if (prim.isEmpty(tags) && vmsToFind.length === 0 && !data.allVMs) {
        opts.log.debug('No tags or VMs to get for owner "%s"',
            opts.data.owner_uuid);
        return callback();
    }

    opts.vmapi.listVms({ query: vmFilter(opts.data) }, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var rvms = [];
        for (var v in vms) {
            var vm = vms[v];

            // Skip VMs that are on this server
            if (vm.hasOwnProperty('server_uuid') &&
                vm.server_uuid == data.serverUUID) {
                continue;
            }

            if (!vm.hasOwnProperty('nics') || vm.nics.length === 0) {
                opts.log.warn(vm, 'Got VM from VMAPI with no nics');
                continue;
            }

            var rvm = {
                enabled: vm.firewall_enabled ? true : false,
                ips: vm.nics.map(function (n) { return n.ip; }),
                owner_uuid: vm.owner_uuid,
                tags: {},
                uuid: vm.uuid
            };

            for (var t in vm.tags) {
                rvm.tags[t] = vm.tags[t];
            }

            rvms.push(rvm);
        }


        if (clientCreated) {
            opts.vmapi.client.close();
        }

        return callback(null, rvms);
    });
}


function populateRemoteVMs(opts, callback) {
    var filter = {};
    if (opts.value.owner_uuid) {
        filter.owner_uuid = opts.value.owner_uuid;
    }

    var payload = {
        req_id: opts.req_id,
        rules: [ opts.value ]
    };

    mod_vm.list(filter, function (err, vms) {
        if (err) {
            return callback(err);
        }

        payload.vms = vms;

        fw.vms({ vms: vms, rule: opts.value }, function (err2, matching) {
            if (err2) {
                return callback(err2);
            }

            if (vms.length === 0) {
                return callback(null, {});
            }

            fw.remoteTargets(payload, function (err3, targets) {
                if (err3) {
                    return callback(err3);
                }

                opts.log.debug({ rule: opts.value, targets: targets },
                    'Remote targets');

                if (prim.isEmpty(targets)) {
                    return callback(null, payload);
                }

                var missing = opts.cache.missing(
                    opts.value.owner_uuid, targets);
                if (prim.isEmpty(missing)) {
                    opts.log.debug({ rule: opts.value },
                        'No missing targets: not fetching from VMAPI');
                    return callback(null, payload);
                }

                opts.log.debug({ rule: opts.value, missing: missing },
                    'Fetching missing targets from VMAPI');

                listVMs({ config: opts.config, log: opts.log, data: missing },
                    function (err4, rvms) {
                    if (err4) {
                        return callback(err4);
                    }

                    opts.cache.addResolveData(missing);

                    if (rvms.length !== 0) {
                        payload.remoteVMs = rvms;
                    }

                    opts.log.debug(rvms.map(function (v) { return v.uuid; }),
                        'Remote VMs retrieved from VMAPI');

                    return callback(null, payload);
                });
            });
        });
    });
}



module.exports = {
    list: listVMs,
    populateRemoteVMs: populateRemoteVMs
};
