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

vasync.pipeline({
    funcs: [
        // Get all the local VMs with firewall_enabled=true
        function loadFwEnabledVms(ctx, next) {
            mod_vm.list(LOG, {
                firewall_enabled: true
            }, function listVmsCb(err, vms) {
                if (err) {
                    next(err);
                    return;
                }
                ctx.vms = vms;
                ctx.vmsByVmUUID = {};
                ctx.vms.forEach(function (vm) {
                    ctx.vmsByVmUUID[vm.uuid] = vm;
                });
                next();
            });
        },
        // Load all the firewall rules for those vms
        function loadFwEnabledRules(ctx, next) {
            if (!ctx.vms.length) {
                next();
                return;
            }
            fw.list({
                log: LOG,
                payload: {
                    localVMs: ctx.vms,
                    vms: ctx.vms
                }
            }, function listRulesCb(err, rules) {
                if (err) {
                    next(err);
                    return;
                }
                ctx.rules = rules;
                next();
            });
        },
        // We're interested only in firewall rules which have `rule.log` set
        function filterRulesWithSetTags(ctx, next) {
            if (!ctx.rules.length) {
                next();
                return;
            }
            ctx.rules = ctx.rules.filter(function ruleHasTags(rule) {
                return rule.log;
            });
            next();
        },
        // Since firewall rules don't keep a reference to the VM they belong
        // to, we need to figure out which VM UUIDs we're gonna need to check
        // based into the firewall rules
        function getVmsForRulesWithSetTags(ctx, next) {
            if (ctx.rules.length === 0) {
                next();
                return;
            }
            ctx.rulesByVmUUID = {};
            vasync.forEachParallel({
                inputs: ctx.rules,
                func: function getRuleVm(rule, nextRule) {
                    fw.vms({
                        log: LOG,
                        payload: {
                            rule: rule,
                            vms: ctx.vms
                        }
                    }, function getRuleVmCb(getErr, vmUuids) {
                        if (getErr) {
                            nextRule(getErr);
                            return;
                        }
                        vmUuids.forEach(function addToCtx(vmUuid) {
                            if (!ctx.rulesByVmUUID[vmUuid]) {
                                ctx.rulesByVmUUID[vmUuid] = [];
                            }
                            ctx.rulesByVmUUID[vmUuid].push(rule);
                        });
                        nextRule();
                    });
                }
            }, next);
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
            if (!ctx.rulesByVmUUID) {
                next();
                return;
            }
            ctx.vmsToRewriteIPF = [];
            var vmsToCheck = Object.keys(ctx.rulesByVmUUID);
            LOG.debug({vmsToCheck: vmsToCheck}, 'VMs to check');
            if (!vmsToCheck.length) {
                next();
                return;
            }
            vasync.forEachParallel({
                inputs: vmsToCheck,
                func: function testIPFFiles(aVm, nextVm) {
                    var ipfv4 = util.format(IPF_CONF,
                        ctx.vmsByVmUUID[aVm].zonepath);
                    var ipfv4Data = fs.readFileSync(ipfv4, 'utf8');
                    var re = /^# smartos_ipf_version (\d+)$/m;
                    var ipfv4Res = re.exec(ipfv4Data);
                    // If we cannot find a version written on the rules file,
                    // let's assume it's version 1 (pre RFD 163):
                    var rulesVersion = (ipfv4Res !== null) ?
                            Number(ipfv4Res[1]) : 1;
                    if (rulesVersion !== ctx.ipfSmartosVersion) {
                        ctx.vmsToRewriteIPF.push(ctx.vmsByVmUUID[aVm]);
                    }

                    LOG.debug({
                        smartos_ipf_version: ctx.ipfSmartosVersion,
                        rules_ipf_version: rulesVersion,
                        vm_uuid: aVm
                    }, 'SmartOS IPF version check');
                    nextVm();
                }
            }, next);
        },
        function updateIpfFiles(ctx, next) {
            if (!Array.isArray(ctx.vmsToRewriteIPF) ||
                ctx.vmsToRewriteIPF.length === 0) {
                next();
                return;
            }
            fw.update({
                log: LOG,
                payload: {
                    localVms: ctx.vmsToRewriteIPF
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
    }
});


// vim: set softtabstop=4 shiftwidth=4:
