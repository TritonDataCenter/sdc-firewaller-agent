/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * vm.update task unit tests
 */

'use strict';

var h = require('./helpers');
var mod_cache = require('../lib/cache');
var mod_rule = require('../lib/rule');
var mod_uuid = require('uuid');
var mod_vm = require('../lib/vm');
var util = require('util');



// --- Globals



var agent;
var d = {
    exp: {
        cache: {},
        rules: [],
        rvms: []
    },
    owners: [ mod_uuid.v4() ],
    rules: [],
    rvms: [],
    vms: []
};



// --- Setup



exports.setup = function (t) {
    h.createAgent(t, true, function (err, a) {
        agent = a;
        t.ifError(err, 'createAgent() error');
        t.done();
    });
};



// --- Tests



exports['update firewall_enabled'] = {
    'setup': function (t) {
        d.vms = [
            h.vm(),
            h.vm({ owner_uuid: d.owners[0] }),
            h.vm({ owner_uuid: d.owners[0], tags: { web: true } })
        ];

        d.rules = [
            h.rule({
                created_by: 'fwapi',
                owner_uuid: d.owners[0],
                rule: 'FROM tag "web" = "true" TO tag "private" = "true" '
                    + 'ALLOW tcp PORT 22'
            })
        ];

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        return t.done();
    },

    // There are no VMs matching any tags in the rule, so it should not
    // be added
    'add rule: no VMs matching': function (t) {
        mod_rule.add(t, d.rules[0]);
    },

    'after rule add': function (t) {
        mod_rule.localEquals(t, d.exp.rules, 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');
        t.deepEqual(agent.cache.cache, d.exp.cache, 'cache empty');

        // d.vms[3]
        d.vms.push(h.vm({
            firewall_enabled: false,
            local: true,
            owner_uuid: d.owners[0],
            tags: { private: true }
        }));

        h.set({
            vms: d.vms
        });

        return t.done();
    },

    // VM has firewall_enabled set to false, so no additional rules or remote
    // VMs should be pulled down
    'add local vm with firewall disabled': function (t) {
        mod_vm.add(t, d.vms[3]);
    },

    'after vm add': function (t) {
        mod_rule.localEquals(t, d.exp.rules, 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');
        t.deepEqual(agent.cache.cache, d.exp.cache, 'cache empty');

        return t.done();
    },

    'update local vm with firewall enabled': function (t) {
        d.vms[d.vms.length - 1].firewall_enabled = true;
        h.set({
            resolve: [ {
                allVMs: false,
                owner_uuid: d.owners[0],
                rules: [ d.rules[0] ],
                tags: {
                    web: 'true'
                },
                vms: []
            } ],
            vms: d.vms
        });

        mod_vm.update(t, d.vms[d.vms.length - 1]);
    },

    'after vm update': function (t) {
        d.exp.rules = [ d.rules[0] ];
        d.exp.rvms = [ h.vmToRVM(d.vms[2]) ];

        mod_rule.localEquals(t, d.exp.rules, 'rule added');
        t.deepEqual(h.localRVMs(), d.exp.rvms, 'remote VM added');
        t.equal(h.vmapiReqs().length, 1, '1 request made to VMAPI');

        mod_cache.addTag(d.exp.cache, d.owners[0], 'web', 'true');
        t.deepEqual(agent.cache.cache, d.exp.cache,
            'tag web=true added to cache');

        return t.done();
    },

    'add second local vm with firewall disabled': function (t) {
        // d.vms[4]
        d.vms.push(h.vm({
            firewall_enabled: false,
            local: true,
            owner_uuid: d.owners[0]
        }));

        h.set({
            vms: d.vms
        });

        mod_vm.add(t, d.vms[4]);
    },

    'after second vm add': function (t) {
        // Nothing on-disk should have changed
        mod_rule.localEquals(t, d.exp.rules, 'rules unchanged');
        t.deepEqual(h.localRVMs(), d.exp.rvms, 'remote VMs unchanged');
        t.deepEqual(agent.cache.cache, d.exp.cache, 'cache unchanged');

        return t.done();
    },

    'add rule to second VM': function (t) {
        // d.rules[1]
        d.rules.push(h.rule({
            created_by: 'fwapi',
            owner_uuid: d.owners[0],
            rule: util.format('FROM any TO vm %s ALLOW tcp PORT 8080',
                d.vms[4].uuid)
        }));

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        mod_rule.add(t, d.rules[1]);
    },

    'after second rule add': function (t) {
        // Nothing on-disk should have changed, since the VM referred to in
        // the added rule has its firewall disabled
        mod_rule.localEquals(t, d.exp.rules, 'rules unchanged');
        t.deepEqual(h.localRVMs(), d.exp.rvms, 'remote VMs unchanged');
        t.deepEqual(agent.cache.cache, d.exp.cache, 'cache unchanged');

        return t.done();
    },

    'update second vm with firewall enabled': function (t) {
        d.vms[d.vms.length - 1].firewall_enabled = true;
        h.set({
            resolve: [ {
                allVMs: false,
                owner_uuid: d.owners[0],
                rules: [ d.rules[1] ],
                tags: {},
                vms: []
            } ],
            vms: d.vms
        });

        mod_vm.update(t, d.vms[d.vms.length - 1]);
    },

    'after second vm update': function (t) {
        // Rule referencing the second VM should have been added
        d.exp.rules.push(d.rules[1]);
        mod_rule.localEquals(t, d.exp.rules, 'rule added');
        t.deepEqual(h.localRVMs(), d.exp.rvms, 'remote VMs unchanged');
        t.deepEqual(agent.cache.cache, d.exp.cache, 'cache unchanged');

        return t.done();
    }
};


exports['vmadm list error'] = function (t) {
    var errMsg = 'ENOENT: something';
    mod_vm.setListError(new Error(errMsg));
    mod_vm.update(t, h.vm(), function (err) {
        t.ok(err, 'error returned');
        if (err) {
            t.equal(err.message, errMsg, 'error message');
        }

        return t.done();
    });
};


exports['update so rules no longer affect VM'] = {
    'create rule': function (t) {
        // Add a local VM
        d.vms = [
            h.vm({ owner_uuid: d.owners[0], local: true,
                tags: { dev: 'proj1' }
            })
        ];

        // And a rule that targets that VM's tag
        d.rules = [
            h.rule({
                created_by: 'fwapi',
                enabled: true,
                owner_uuid: d.owners[0],
                rule: 'FROM any TO tag "dev" = "proj1" ALLOW tcp PORT 22'
            })
        ];

        h.reset();
        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        mod_rule.add(t, d.rules[0], function (err, msg) {
            t.ok(msg, 'message returned');
            t.ifError(err, 'add rule');
            if (err) {
                t.done();
                return;
            }

            mod_rule.localEquals(t, d.rules, 'rule added');
            mod_vm.ipfRule(t, {
                direction: 'in',
                port: 22,
                proto: 'tcp',
                target: 'any',
                vm: d.vms[0]
            });

            t.done();
        });
    },

    // Now update the VM so that it has a different tag - this should
    // un-apply the rule to that VM, even though the rule is still on the CN
    'update VM': function (t) {
        d.vms[0].tags = {
            dev: 'proj2'
        };

        // Make the VM change take effect in the mocks:
        h.set({
            fwapiRules: d.rules,
            resolve: [ {
                allVMs: false,
                owner_uuid: d.owners[0],
                rules: [],
                tags: {},
                vms: []
            } ],
            vms: d.vms
        });

        mod_vm.update(t, d.vms[0], function (err) {
            t.ifError(err, 'update VM');
            if (err) {
                return t.done();
            }

            mod_rule.localEquals(t, d.rules, 'rule unchanged');
            mod_vm.ipfRule(t, {
                direction: 'in',
                port: 22,
                proto: 'tcp',
                target: 'any',
                vm: d.vms[0],
                doesNotExist: true
            });

            return t.done();
        });
    }
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};
