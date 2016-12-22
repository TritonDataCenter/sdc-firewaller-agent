/*
 * CDDL HEADER START
 *
 * The contents of this file are subject to the terms of the
 * Common Development and Distribution License, Version 1.0 only
 * (the "License").  You may not use this file except in compliance
 * with the License.
 *
 * You can obtain a copy of the license at http://smartos.org/CDDL
 *
 * See the License for the specific language governing permissions
 * and limitations under the License.
 *
 * When distributing Covered Code, include this CDDL HEADER in each
 * file.
 *
 * If applicable, add the following below this CDDL HEADER, with the
 * fields enclosed by brackets "[]" replaced with your own identifying
 * information: Portions Copyright [yyyy] [name of copyright owner]
 *
 * CDDL HEADER END
 *
 * Copyright (c) 2016, Joyent, Inc. All rights reserved.
 *
 * fwadm test: remote VMs
 */

var async = require('async');
var clone = require('clone');
var fw;
var helpers = require('../lib/helpers');
var mocks = require('../lib/mocks');
var mod_obj = require('../../lib/util/obj');
var mod_uuid = require('node-uuid');
var util = require('util');
var util_vm = require('../../lib/util/vm');

var createSubObjects = mod_obj.createSubObjects;
var ipKey = helpers.ipKey;



// --- Globals



// Set this to any of the exports in this file to only run that test,
// plus setup and teardown
var runOne;
// Print out UUIDs of VMs in this test (for debugging):
var printVMs = process.env.PRINTVMS || false;



// --- Setup



exports['setup'] = function (t) {
    fw = mocks.setup();
    t.ok(fw, 'fw loaded');
    t.done();
};


// run before every test
exports.setUp = function (cb) {
    mocks.reset();
    cb();
};



// --- Tests



exports['local VM to remote VM'] = function (t) {
    var vm = helpers.generateVM();
    var rvm = helpers.generateVM({
        nics: [ { ips: ['10.1.1.1/24', 'fd22::5/64'] }, { ip: '10.2.2.2' } ]
    });
    var rvm2 = helpers.generateVM({
        nics: [ { ip: '10.1.1.2' } ]
    });

    var rvmNICs = rvm.nics;

    var v4rules, v6rules;
    var expRulesOnDisk = {};
    var remoteVMsOnDisk = {};
    var vmsEnabled = {};

    var payload = {
        remoteVMs: [rvm],
        rules: [
            {
                owner_uuid: vm.owner_uuid,
                rule: util.format('FROM vm %s TO vm %s ALLOW tcp PORT 80',
                                vm.uuid, rvm.uuid),
                enabled: true
            },
            {
                owner_uuid: vm.owner_uuid,
                rule: util.format('FROM vm %s TO vm %s ALLOW tcp PORT 80',
                                rvm.uuid, vm.uuid),
                enabled: true
            }
        ],
        vms: [vm]
    };

    var rule1 = clone(payload.rules[0]);
    var rule2 = clone(payload.rules[1]);
    var rule3;
    var rule4;

    if (printVMs) {
        console.log('vm=%s', vm.uuid);
        console.log('rvm=%s', rvm.uuid);
    }

    async.series([
    function (cb) {
        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        // There are no rules yet, so the new rvm should not be the
        // target of any of them
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [],
            rvm: rvm,
            vms: [vm]
        }, cb);

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, [rule1, rule2]);
            t.deepEqual(helpers.sortRes(res), {
                vms: [ vm.uuid ],
                rules: [ rule1, rule2 ].sort(helpers.uuidSort),
                remoteVMs: [ rvm.uuid ]
            }, 'rules returned');

            v4rules = helpers.defaultZoneRules(vm.uuid);
            createSubObjects(v4rules, vm.uuid, 'in', 'pass', 'tcp');
            v4rules[vm.uuid]['in'].pass.tcp[ipKey(rvmNICs[0].ips[0])] = [ 80 ];
            v4rules[vm.uuid]['in'].pass.tcp[rvm.nics[1].ip] = [ 80 ];

            v6rules = helpers.defaultZoneRules(vm.uuid);
            createSubObjects(v6rules, vm.uuid, 'in', 'pass', 'tcp');
            v6rules[vm.uuid]['in'].pass.tcp[ipKey(rvmNICs[0].ips[1])] = [ 80 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            vmsEnabled[vm.uuid] = true;

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvm.uuid] = util_vm.createRemoteVM(rvm);

            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule1.uuid] = clone(rule1);
            expRulesOnDisk[rule2.uuid] = clone(rule2);

            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2],
            rvm: rvm,
            vms: [vm]
        }, cb);

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2],
            rvm: rvm.uuid,
            vms: [vm]
        }, cb);

    }, function (cb) {
        fw.getRVM({ remoteVM: rvm.uuid }, function (err, res) {
            t.ifError(err);
            t.deepEqual(res, util_vm.createRemoteVM(rvm),
                'Remote VM returned');

            return cb();
        });

    }, function (cb) {
        // Add another rule referencing rvm
        rule3 = {
            owner_uuid: vm.owner_uuid,
            enabled: true,
            rule: util.format('FROM vm %s TO vm %s ALLOW udp PORT 161',
                            rvm.uuid, vm.uuid)
        };

        payload = {
            rules: [ clone(rule3) ],
            vms: [vm]
        };

        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, rule3);

            createSubObjects(v4rules, vm.uuid, 'in', 'pass', 'udp');
            v4rules[vm.uuid]['in'].pass.udp[ipKey(rvmNICs[0].ips[0])] = [ 161 ];
            v4rules[vm.uuid]['in'].pass.udp[rvm.nics[1].ip] = [ 161 ];

            createSubObjects(v6rules, vm.uuid, 'in', 'pass', 'udp');
            v6rules[vm.uuid]['in'].pass.udp[ipKey(rvmNICs[0].ips[1])] = [ 161 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule3.uuid] = clone(rule3);
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2, rule3],
            rvm: rvm,
            vms: [vm]
        }, cb);

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2, rule3],
            rvm: rvm.uuid,
            vms: [vm]
        }, cb);

    }, function (cb) {
        // Make sure a completely different remote VM doesn't pick up any of
        // the rules
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [],
            rvm: helpers.generateVM(),
            vms: [vm]
        }, cb);

    }, function (cb) {
        // Delete rule 3

        var delPayload = {
            uuids: [rule3.uuid],
            vms: [vm]
        };

        fw.del(delPayload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            delete v4rules[vm.uuid]['in'].pass.udp;
            delete v6rules[vm.uuid]['in'].pass.udp;
            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            delete expRulesOnDisk[rule3.uuid];
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2],
            rvm: rvm,
            vms: [vm]
        }, cb);

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2],
            rvm: rvm.uuid,
            vms: [vm]
        }, cb);

    }, function (cb) {
        // Disabling and re-enabling the firewall should have no effect on the
        // zone rules
        helpers.testEnableDisable({
            t: t,
            vm: vm,
            vms: [vm]
        }, cb);

    }, function (cb) {
        helpers.testRVMlist({
            t: t,
            rvms: [rvm]
        }, cb);

    }, function (cb) {
        fw.del({ rvmUUIDs: [rvm.uuid], vms: [vm]}, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            // All of the rules reference rvm, so the ipf rules should
            // effectively be the default now
            v4rules = helpers.defaultZoneRules(vm.uuid);
            v6rules = helpers.defaultZoneRules(vm.uuid);
            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules back to default');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules back to default');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            delete remoteVMsOnDisk[rvm.uuid];
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VM deleted from disk');

            return cb();
        });

    }, function (cb) {
        helpers.testRVMlist({
            t: t,
            rvms: []
        }, cb);

    }, function (cb) {
        fw.getRVM({ remoteVM: rvm.uuid }, function (err, res) {
            t.ok(err, 'error returned');
            if (!err) {
                return cb();
            }

            t.equal(err.code, 'ENOENT', 'error code');
            t.equal(err.message,
                util.format('Unknown remote VM "%s"', rvm.uuid),
                'error message');
            return cb();
        });

    }, function (cb) {
        // Add another rule and rvm, to make sure that the existing (but
        // disabled) rules won't cause errors
        rule4 = {
            owner_uuid: vm.owner_uuid,
            rule: util.format('FROM vm %s TO vm %s ALLOW tcp PORT 90',
                            rvm2.uuid, vm.uuid),
            enabled: true
        };
        payload = {
            remoteVMs: [rvm2],
            rules: [ clone(rule4) ],
            vms: [vm]
        };

        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, rule4);

            createSubObjects(v4rules, vm.uuid, 'in', 'pass', 'tcp');
            v4rules[vm.uuid]['in'].pass.tcp[rvm2.nics[0].ip] = [ 90 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvm2.uuid] = util_vm.createRemoteVM(rvm2);
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule4.uuid] = clone(rule4);
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.testRVMlist({
            t: t,
            rvms: [rvm2]
        }, cb);

    }, function (cb) {
        // Make sure deleting both a rule and remote VM works
        fw.del({ uuids: [rule4.uuid], rvmUUIDs: [rvm2.uuid], vms: [vm]},
            function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            // ipf rules should be back to the default now
            v4rules = helpers.defaultZoneRules(vm.uuid);
            v6rules = helpers.defaultZoneRules(vm.uuid);
            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules back to default');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules back to default');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            delete remoteVMsOnDisk[rvm2.uuid];
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VM 2 deleted from disk');

            return cb();
        });
    }

    ], function () {
        t.done();
    });
};


exports['local VM to remote tag'] = function (t) {
    var vm = helpers.generateVM();
    var rvm = helpers.generateVM({ tags: { other: true } });

    var v4rules, v6rules;
    var expRulesOnDisk = {};
    var remoteVMsOnDisk = {};
    var vmsEnabled = {};

    var payload = {
        remoteVMs: [rvm],
        rules: [
            {
                owner_uuid: vm.owner_uuid,
                rule: util.format('FROM vm %s TO tag "other" ALLOW tcp PORT 80',
                                vm.uuid),
                enabled: true
            },
            {
                owner_uuid: vm.owner_uuid,
                rule: util.format('FROM tag "other" TO vm %s ALLOW tcp PORT 80',
                                vm.uuid),
                enabled: true
            }
        ],
        vms: [vm]
    };

    var rule1 = clone(payload.rules[0]);
    var rule2 = clone(payload.rules[1]);
    var rule3;

    if (printVMs) {
        console.log('vm=%s', vm.uuid);
        console.log('rvm=%s', rvm.uuid);
    }

    async.series([
    function (cb) {
        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, [rule1, rule2]);

            v4rules = helpers.defaultZoneRules(vm.uuid);
            v6rules = helpers.defaultZoneRules(vm.uuid);
            createSubObjects(v4rules, vm.uuid, 'in', 'pass', 'tcp');
            v4rules[vm.uuid]['in'].pass.tcp[rvm.nics[0].ip] = [ 80 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            vmsEnabled[vm.uuid] = true;

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvm.uuid] = util_vm.createRemoteVM(rvm);

            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule1.uuid] = clone(rule1);
            expRulesOnDisk[rule2.uuid] = clone(rule2);

            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2],
            rvm: rvm.uuid,
            vms: [vm]
        }, cb);

    }, function (cb) {
        helpers.testRVMlist({
            t: t,
            rvms: [rvm]
        }, cb);

    }, function (cb) {
        // Add another rule referencing rvm
        rule3 = {
            enabled: true,
            owner_uuid: vm.owner_uuid,
            rule: util.format('FROM vm %s TO vm %s ALLOW udp PORT 161',
                            rvm.uuid, vm.uuid)
        };
        payload.rules = [ clone(rule3) ];

        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, rule3);

            createSubObjects(v4rules, vm.uuid, 'in', 'pass', 'udp');
            v4rules[vm.uuid]['in'].pass.udp[rvm.nics[0].ip] = [ 161 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule3.uuid] = clone(rule3);
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2, rule3],
            rvm: rvm.uuid,
            vms: [vm]
        }, cb);

    }, function (cb) {
        // Make sure a completely different remote VM doesn't pick up any of
        // the rules
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [],
            rvm: helpers.generateVM(),
            vms: [vm]
        }, cb);

    }, function (cb) {
        // Delete rule 3

        var delPayload = {
            uuids: [rule3.uuid],
            vms: [vm]
        };

        fw.del(delPayload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            delete v4rules[vm.uuid]['in'].pass.udp;
            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            delete expRulesOnDisk[rule3.uuid];
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2],
            rvm: rvm.uuid,
            vms: [vm]
        }, cb);
    }

    ], function () {
        t.done();
    });
};


exports['FWAPI-248 - only list an applicable rule once'] = function (t) {
    var rvm = helpers.generateVM({ tags: { foo: true, bar: false } });
    var rule = {
        owner_uuid: rvm.owner_uuid,
        rule: 'FROM tag "foo" TO tag "bar" ALLOW tcp PORT 80',
        enabled: true
    };
    var payload = {
        remoteVMs: [ rvm ],
        rules: [ clone(rule) ],
        vms: []
    };

    async.series([
    function (cb) {
        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            cb();
        });
    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                cb(err);
                return;
            }
            helpers.fillInRuleBlanks(res.rules, [ rule ]);
            cb();
        });
    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [ rule ],
            rvm: rvm.uuid,
            vms: []
        }, cb);
    }], function () {
        t.done();
    });
};


exports['local VM and remote VM to IP'] = function (t) {
    var vm = helpers.generateVM({
        uuid: '5293cc31-189c-4b10-be90-7c74c78de927' });
    var rvm = helpers.generateVM({
        uuid: 'da08034b-37a0-4788-9c97-e84f685b6561' });

    var v4rules, v6rules;
    var expRulesOnDisk = {};
    var remoteVMsOnDisk = {};
    var vmsEnabled = {};

    var payload = {
        remoteVMs: [rvm],
        rules: [
            {
                owner_uuid: vm.owner_uuid,
                rule: util.format('FROM (vm %s OR vm %s) TO ip 10.0.0.1 '
                    + 'ALLOW tcp PORT 80', vm.uuid, rvm.uuid),
                enabled: true
            },
            {
                owner_uuid: vm.owner_uuid,
                rule: util.format('FROM ip 10.0.0.1 TO (vm %s OR vm %s) '
                    + 'ALLOW tcp PORT 80', vm.uuid, rvm.uuid),
                enabled: true
            }
        ],
        vms: [vm]
    };

    var rule1 = clone(payload.rules[0]);
    var rule2 = clone(payload.rules[1]);

    if (printVMs) {
        console.log('vm=%s', vm.uuid);
        console.log('rvm=%s', rvm.uuid);
    }

    async.series([
    function (cb) {
        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, [rule1, rule2]);

            v4rules = helpers.defaultZoneRules(vm.uuid);
            v6rules = helpers.defaultZoneRules(vm.uuid);
            createSubObjects(v4rules, vm.uuid, 'in', 'pass', 'tcp');
            v4rules[vm.uuid]['in'].pass.tcp['10.0.0.1'] = [ 80 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            vmsEnabled[vm.uuid] = true;

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvm.uuid] = util_vm.createRemoteVM(rvm);

            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule1.uuid] = clone(rule1);
            expRulesOnDisk[rule2.uuid] = clone(rule2);

            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2],
            rvm: rvm.uuid,
            vms: [vm]
        }, cb);

    }, function (cb) {
        // Make sure a completely different remote VM doesn't pick up any of
        // the rules
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [],
            rvm: helpers.generateVM(),
            vms: [vm]
        }, cb);
    }

    ], function () {
            t.done();
    });
};


exports['all vms to local VM'] = function (t) {
    var vm = helpers.generateVM();
    var rvm = helpers.generateVM();

    var v4rules, v6rules;
    var expRulesOnDisk = {};
    var remoteVMsOnDisk = {};
    var vmsEnabled = {};

    var payload = {
        remoteVMs: [rvm],
        rules: [
            {
                owner_uuid: vm.owner_uuid,
                rule: util.format('FROM all vms TO vm %s ALLOW tcp PORT 44',
                    vm.uuid),
                enabled: true
            }
        ],
        vms: [vm]
    };

    var rule1 = clone(payload.rules[0]);

    if (printVMs) {
        console.log('vm=%s', vm.uuid);
        console.log('rvm=%s', rvm.uuid);
    }

    async.series([
    function (cb) {
        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, [rule1]);

            v4rules = helpers.defaultZoneRules(vm.uuid);
            v6rules = helpers.defaultZoneRules(vm.uuid);
            createSubObjects(v4rules, vm.uuid, 'in', 'pass', 'tcp');
            v4rules[vm.uuid]['in'].pass.tcp[vm.nics[0].ip] = [ 44 ];
            v4rules[vm.uuid]['in'].pass.tcp[rvm.nics[0].ip] = [ 44 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            vmsEnabled[vm.uuid] = true;
            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvm.uuid] = util_vm.createRemoteVM(rvm);
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule1.uuid] = rule1;
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });
    }, function (cb) {
        // Add another unrelated rule and make sure the first rule still gets
        // picked up
        var addPayload = {
            rules: [
                {
                    owner_uuid: vm.owner_uuid,
                    rule: util.format(
                        'FROM ip 10.6.0.1 TO vm %s ALLOW tcp PORT 45', vm.uuid),
                    enabled: true
                }
            ],
            vms: [vm]
        };
        var rule2 = clone(addPayload.rules[0]);

        fw.add(addPayload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, [rule2]);

            v4rules[vm.uuid]['in'].pass.tcp['10.6.0.1'] = [ 45 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            vmsEnabled[vm.uuid] = true;
            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvm.uuid] = util_vm.createRemoteVM(rvm);
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule2.uuid] = rule2;
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });
    }

    ], function () {
            t.done();
    });
};


exports['owner_uuid filtering'] = function (t) {
    var ownerA = mod_uuid.v4();
    var ownerB = mod_uuid.v4();
    var vm = helpers.generateVM({ owner_uuid: ownerA, tags: { one: true } });
    var rvm1 = helpers.generateVM({ owner_uuid: ownerA, tags: { one: true } });
    var rvm2 = helpers.generateVM({ owner_uuid: ownerB, tags: { one: true } });

    var v4rules, v6rules;
    var expRulesOnDisk = {};
    var remoteVMsOnDisk = {};
    var vmsEnabled = {};

    var payload = {
        rules: [
            {
                rule: util.format('FROM tag "one" TO vm %s ALLOW tcp PORT 25',
                                vm.uuid),
                owner_uuid: ownerA,
                enabled: true
            }
        ],
        vms: [vm]
    };

    var rule1 = clone(payload.rules[0]);

    if (printVMs) {
        console.log('vm=%s', vm.uuid);
        console.log('rvm1=%s', rvm1.uuid);
        console.log('rvm2=%s', rvm2.uuid);
    }

    async.series([
    function (cb) {
        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, rule1);
            t.deepEqual(helpers.sortRes(res), {
                rules: [ rule1 ],
                vms: [ vm.uuid ]
            }, 'rules returned');

            v4rules = helpers.defaultZoneRules(vm.uuid);
            v6rules = helpers.defaultZoneRules(vm.uuid);
            createSubObjects(v4rules, vm.uuid, 'in', 'pass', 'tcp');
            v4rules[vm.uuid]['in'].pass.tcp[vm.nics[0].ip] = [ 25 ];

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            vmsEnabled[vm.uuid] = true;

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rule1.uuid] = clone(rule1);
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        fw.validatePayload({ vms: [ vm ], remoteVMs: [ rvm1 ] },
            function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        // Add rvm1
        fw.add({ vms: [ vm ], remoteVMs: [ rvm1 ] }, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            t.deepEqual(helpers.sortRes(res), {
                rules: [ ],
                vms: [ vm.uuid ],
                remoteVMs: [ rvm1.uuid ]
            }, 'rules returned');

            v4rules[vm.uuid]['in'].pass.tcp[rvm1.nics[0].ip] = [ 25 ];
            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvm1.uuid] = util_vm.createRemoteVM(rvm1);
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.testRVMlist({
            t: t,
            rvms: [rvm1]
        }, cb);

    }, function (cb) {
        // Add rvm2 - since it has a different owner_uuid, no rules should
        // change
        fw.add({ vms: [ vm ], remoteVMs: [ rvm2 ] }, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            t.deepEqual(helpers.sortRes(res), {
                rules: [ ],
                vms: [ ],
                remoteVMs: [ rvm2.uuid ]
            }, 'rules returned');

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');
            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvm2.uuid] = util_vm.createRemoteVM(rvm2);
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        helpers.testRVMlist({
            t: t,
            rvms: [rvm1, rvm2]
        }, cb);
    }

    ], function () {
            t.done();
    });
};


exports['delete: different VMs than RVMs in rule'] = function (t) {
    var vms = [ helpers.generateVM(), helpers.generateVM() ];
    var rvms = [ helpers.generateVM(), helpers.generateVM() ];

    var v4rules = {}, v6rules;
    var expRulesOnDisk = {};
    var remoteVMsOnDisk = {};
    var vmsEnabled = {};

    var rules = [
        {
            owner_uuid: vms[0].owner_uuid,
            rule: util.format('FROM vm %s TO vm %s ALLOW tcp PORT 80',
                rvms[0].uuid, vms[0].uuid),
            enabled: true
        },
        {
            owner_uuid: vms[0].owner_uuid,
            rule: util.format('FROM ip 10.2.0.2 TO vm %s ALLOW tcp PORT 81',
                vms[1].uuid),
            enabled: true
        },
        {
            owner_uuid: vms[0].owner_uuid,
            rule: util.format('FROM vm %s TO vm %s ALLOW tcp PORT 82',
                rvms[1].uuid, vms[1].uuid),
            enabled: true
        }
    ];
    var payload = {
        remoteVMs: rvms,
        rules: rules,
        vms: vms
    };

    if (printVMs) {
        helpers.printVM('vms[0]', vms[0]);
        helpers.printVM('vms[1]', vms[1]);
        helpers.printVM('rvms[0]', rvms[0]);
        helpers.printVM('rvms[1]', rvms[1]);
    }

    async.series([
    function (cb) {
        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            return cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            helpers.fillInRuleBlanks(res.rules, rules);
            t.deepEqual(helpers.sortRes(res), {
                vms: [ vms[0].uuid, vms[1].uuid ].sort(),
                rules: [ rules[0], rules[1], rules[2] ].sort(helpers.uuidSort),
                remoteVMs: helpers.sortedUUIDs(rvms)
            }, 'rules returned');

            helpers.addZoneRules(v4rules, [
                [vms[0], 'in', 'pass', 'tcp', rvms[0].nics[0].ip, 80],
                [vms[1], 'in', 'pass', 'tcp', '10.2.0.2', 81],
                [vms[1], 'in', 'pass', 'tcp', rvms[1].nics[0].ip, 82]
            ]);
            v6rules = helpers.defaultZoneRules([vms[0].uuid, vms[1].uuid]);

            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            vmsEnabled[vms[0].uuid] = true;
            vmsEnabled[vms[1].uuid] = true;
            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            remoteVMsOnDisk[rvms[0].uuid] = util_vm.createRemoteVM(rvms[0]);
            remoteVMsOnDisk[rvms[1].uuid] = util_vm.createRemoteVM(rvms[1]);
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            expRulesOnDisk[rules[0].uuid] = clone(rules[0]);
            expRulesOnDisk[rules[1].uuid] = clone(rules[1]);
            expRulesOnDisk[rules[2].uuid] = clone(rules[2]);

            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        // Delete rvms[1]

        var delPayload = {
            rvmUUIDs: [rvms[1].uuid],
            vms: vms
        };

        fw.del(delPayload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            delete v4rules[vms[1].uuid]['in'].pass.tcp[rvms[1].nics[0].ip];
            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            delete remoteVMsOnDisk[rvms[1].uuid];
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }, function (cb) {
        // Delete both an RVM and a rule

        var delPayload = {
            uuids: [rules[1].uuid],
            rvmUUIDs: [rvms[0].uuid],
            vms: vms
        };

        fw.del(delPayload, function (err, res) {
            t.ifError(err);
            if (err) {
                return cb(err);
            }

            delete v4rules[vms[0].uuid]['in'].pass;
            delete v4rules[vms[1].uuid]['in'].pass;
            t.deepEqual(helpers.zoneIPFconfigs(4), v4rules,
                'IPv4 firewall rules');
            t.deepEqual(helpers.zoneIPFconfigs(6), v6rules,
                'IPv6 firewall rules');

            t.deepEqual(helpers.getIPFenabled(), vmsEnabled,
                'firewalls enabled');

            delete remoteVMsOnDisk[rvms[0].uuid];
            t.deepEqual(helpers.remoteVMsOnDisk(), remoteVMsOnDisk,
                'remote VMs on disk');

            delete expRulesOnDisk[rules[1].uuid];
            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            return cb();
        });

    }

    ], function () {
        t.done();
    });
};


exports['FWAPI-252: Allow using rvmRules() on RVM w/o IPs'] = function (t) {
    var rvm = helpers.generateVM({ tags: { other: true } });
    delete rvm.ips;
    delete rvm.nics;

    var expRulesOnDisk = {};

    var payload = {
        remoteVMs: [],
        rules: [
            {
                owner_uuid: rvm.owner_uuid,
                rule: 'FROM tag "foo" TO tag "other" ALLOW tcp PORT 80',
                enabled: true
            },
            {
                owner_uuid: rvm.owner_uuid,
                rule: 'FROM tag "other" TO tag "foo" ALLOW tcp PORT 80',
                enabled: true
            },
            {
                owner_uuid: rvm.owner_uuid,
                rule: 'FROM tag "foo" TO tag "bar" ALLOW tcp PORT 80',
                enabled: true
            }
        ],
        vms: []
    };

    var rule1 = clone(payload.rules[0]);
    var rule2 = clone(payload.rules[1]);
    var rule3 = clone(payload.rules[2]);

    async.series([
    function (cb) {
        fw.validatePayload(payload, function (err, res) {
            t.ifError(err);
            cb();
        });

    }, function (cb) {
        fw.add(payload, function (err, res) {
            t.ifError(err);
            if (err) {
                cb(err);
                return;
            }

            helpers.fillInRuleBlanks(res.rules, [rule1, rule2, rule3]);

            expRulesOnDisk[rule1.uuid] = clone(rule1);
            expRulesOnDisk[rule2.uuid] = clone(rule2);
            expRulesOnDisk[rule3.uuid] = clone(rule3);

            t.deepEqual(helpers.rulesOnDisk(), expRulesOnDisk, 'rules on disk');

            cb();
        });

    }, function (cb) {
        helpers.fwRvmRulesEqual({
            t: t,
            rules: [rule1, rule2],
            rvm: rvm,
            vms: []
        }, cb);
    }

    ], function () {
        t.done();
    });
};


exports['invalid and missing parameters'] = function (t) {
    var payload = {
        vms: [ helpers.generateVM() ]
    };

    var invalidIPs = helpers.generateVM();
    invalidIPs.ips = [ '1.2.3.4.5' ];

    var missingIPs = helpers.generateVM();
    delete missingIPs.nics;
    delete missingIPs.ips;

    var missingUUID = helpers.generateVM();
    delete missingUUID.uuid;

    var sameUUID = helpers.generateVM();
    sameUUID.uuid = payload.vms[0].uuid;

    var badUUID = helpers.generateVM({ uuid: 'hasOwnProperty' });

    var badOwnerUUID = helpers.generateVM({ owner_uuid: 'hasOwnProperty' });

    var invalid = [
        [ 'invalid rule UUID', badUUID,
            'Invalid Remote VM UUID: hasOwnProperty' ],

        [ 'invalid owner UUID', badOwnerUUID,
            'Invalid owner UUID: hasOwnProperty' ],

        [ 'invalid IPs', invalidIPs, util.format(
            'Invalid IP address: %s', invalidIPs.ips[0]) ],

        [ 'missing IPs', missingIPs, util.format(
            'Remote VM "%s": missing IPs', missingIPs.uuid) ],

        [ 'missing UUID', missingUUID, 'Remote VM must have UUID' ],

        [ 'same UUID as local VM', sameUUID, util.format(
            'Remote VM "%s" must not have the same UUID as a local VM',
            sameUUID.uuid) ]
    ];

    async.forEachSeries(invalid, function (params, cb) {
        var msg = params[0] + ': ';
        var vm = params[1];
        var errMsg = params[2];

        payload.remoteVMs = [vm];

        fw.validatePayload(payload, function (err) {
            t.ok(err, msg + 'error returned');
            if (err) {
                t.equal(err.message, errMsg, msg + 'validate error message');
                t.equal(err.details, vm, msg + 'validate error details');
            }

            fw.add(payload, function (err2) {
                t.ok(err2, msg + 'add error returned');
                if (err2) {
                    t.equal(err2.message, errMsg, msg + 'add error message');
                    t.equal(err2.details, vm, msg + 'add error details');
                }

                fw.update(payload, function (err3) {
                    t.ok(err3, msg + 'update error returned');
                    if (err3) {
                        t.equal(err3.message, errMsg,
                            msg + 'update error message');
                        t.equal(err3.details, vm, msg + 'update error details');
                    }

                    return cb();
                });
            });
        });

    }, function () {
        t.done();
    });
};



// --- Teardown



exports['teardown'] = function (t) {
    mocks.teardown();
    t.done();
};


// Use to run only one test in this file:
if (runOne) {
    module.exports = {
        setup: exports.setup,
        setUp: exports.setUp,
        oneTest: runOne,
        teardown: exports.teardown
    };
}
