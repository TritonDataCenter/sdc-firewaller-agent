/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Firewaller agent config migration from/to pre/post cfwlogging
 * See https://github.com/joyent/rfd/blob/master/rfd/0163/README.md
 */

'use strict';

var bunyan = require('bunyan');
var vasync = require('vasync');

var mod_vm = require('./lib/vm');
var fw = require('./lib/fw');

var fs = require('fs');
var util = require('util');

var LOG = bunyan.createLogger({
    name: 'firewaller-config-migration',
    level: 'debug'
});

var DEV_IPFEV = '/dev/ipfev';
var IPF_CONF = '%s/config/ipf.conf';
var IPF_VER_RE = /^# smartos_ipf_version (\d+)$/m;

vasync.pipeline({
    funcs: [
        // Get all the local VMs with firewall_enabled=true
        function loadFwEnabledVms(ctx, next) {
            mod_vm.list(LOG, {}, function listVmsCb(err, allVMs) {
                if (err) {
                    next(err);
                    return;
                }
                ctx.allVMs = allVMs;
                ctx.vms = allVMs.filter(function (vm) {
                    return vm.firewall_enabled;
                });
                ctx.vmsByVmUUID = {};
                ctx.vms.forEach(function (vm) {
                    ctx.vmsByVmUUID[vm.uuid] = vm;
                });
                next();
            });
        },
        function getPlatformIPFVersion(ctx, next) {
            var vFile = '/etc/ipf/smartos_version';
            if (fs.existsSync(vFile)) {
                ctx.ipfSmartosVersion = Number(fs.readFileSync(vFile, 'utf8'));
            } else {
                ctx.ipfSmartosVersion = (ctx.haveDevIpfEv) ? 2 : 1;
            }
            next();
        },
        // Once we know which vms to check, we need to review the contents of
        // the IPF files
        function checkIPFVersions(ctx, next) {
            if (ctx.vms.length === 0) {
                next();
                return;
            }

            ctx.vmsToRewriteIPF = [];

            vasync.forEachParallel({
                inputs: ctx.vms,
                func: function testIPFFiles(vm, nextVm) {
                    var ipfv4 = util.format(IPF_CONF,
                        ctx.vmsByVmUUID[vm.uuid].zonepath);
                    var ipfv4Data;
                    try {
                        ipfv4Data = fs.readFileSync(ipfv4, 'utf8');
                    } catch (err) {
                        if (err.code !== 'ENOENT') {
                            nextVm(err);
                            return;
                        }
                        nextVm();
                        return;
                    }
                    var ipfv4Res = IPF_VER_RE.exec(ipfv4Data);
                    // If we cannot find a version written on the rules file,
                    // let's assume it's version 1 (pre RFD 163):
                    var rulesVersion = (ipfv4Res !== null) ?
                            Number(ipfv4Res[1]) : 1;
                    if (rulesVersion !== ctx.ipfSmartosVersion) {
                        ctx.vmsToRewriteIPF.push(ctx.vmsByVmUUID[vm.uuid]);
                    }

                    LOG.debug({
                        smartos_ipf_version: ctx.ipfSmartosVersion,
                        rules_ipf_version: rulesVersion,
                        vm_uuid: vm.uuid
                    }, 'SmartOS IPF version check');
                    nextVm();
                }
            }, next);
        },
        function updateIpfFiles(ctx, next) {
            if (!Array.isArray(ctx.vmsToRewriteIPF) ||
                ctx.vmsToRewriteIPF.length === 0) {
                LOG.info('found 0 VMs that need their ipfilter ' +
                    'configuration rewritten');
                next();
                return;
            }
            fw.update({
                log: LOG,
                payload: {
                    localVMs: ctx.vmsToRewriteIPF,
                    vms: ctx.allVMs
                }
            }, next);
        }
    ],
    arg: {
        haveDevIpfEv: fs.existsSync(DEV_IPFEV)
    }
}, function pipeCb(pipeErr) {
    if (pipeErr) {
        console.error(pipeErr);
        process.exit(1);
    } else {
        process.exit(0);
    }
});


// vim: set softtabstop=4 shiftwidth=4:
