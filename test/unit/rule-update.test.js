/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * update-rule task unit tests
 */

var fmt = require('util').format;
var h = require('./helpers');
var mod_rule = require('../lib/rule');
var mod_uuid = require('node-uuid');
var mod_vm = require('../lib/vm');
var util = require('util');



// --- Globals



var agent;
var d = {
    owners: [ mod_uuid.v4() ],
    rules: [],
    vms: []
};



// --- Setup



exports.setup = function (t) {
    h.createAgent(t, true, function (err, a) {
        agent = a;
        return t.done();
    });
};



// --- Tests



exports['vmadm list error'] = function (t) {
    var errMsg = 'ENOENT: something';
    mod_vm.setListError(new Error(errMsg));
    var rule = h.rule({
        owner_uuid: mod_uuid.v4(),
        rule: 'FROM any TO all vms ALLOW udp PORT 5432'
    });

    mod_rule.update(t, rule, function (err) {
        t.ok(err, 'error returned');
        if (err) {
            t.equal(err.message, errMsg, 'error message');
        }

        return t.done();
    });
};


exports['update to not affect local VMs'] = {
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
                rule: 'FROM any TO tag dev = proj1 ALLOW tcp PORT 22'
            })
        ];

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        mod_rule.add(t, d.rules[0], function (err, msg) {
            t.ifError(err, 'add rule');
            if (err) {
                return t.done();
            }

            mod_rule.localEquals(t, d.rules, 'rule added');
            mod_vm.ipfRule(t, {
                direction: 'in',
                port: 22,
                proto: 'tcp',
                target: 'any',
                vm: d.vms[0]
            });
            return t.done();
        });
    },

    // Now update the rule so that it targets a different tag - this should
    // still update the rule on the CN, even though it no longer targets the
    // VM that it used to apply to
    'update rule': function (t) {
        d.rules[0].rule = 'FROM any TO tag dev = proj2 ALLOW tcp PORT 22';

        mod_rule.update(t, d.rules[0], function (err) {
            t.ifError(err, 'update rule');
            if (err) {
                return t.done();
            }

            mod_rule.localEquals(t, d.rules, 'rule updated');
            mod_vm.ipfRule(t, {
                direction: 'in',
                doesNotExist: true,
                port: 22,
                proto: 'tcp',
                target: 'any',
                vm: d.vms[0]
            });
            return t.done();
        });
    }
};


exports['update via API'] = {
    'no VMs targeted': function (t) {
        d.rules = [];
        d.vms = [];

        h.reset();
        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        d.rule = {
            enabled: true,
            owner_uuid: mod_uuid.v4(),
            rule: fmt('FROM any TO vm %s ALLOW udp PORT 9090', mod_uuid.v4()),
            uuid: mod_uuid.v4()
        };

        mod_rule.apiUpdate(t, {
            fillInMissing: true,
            rule: d.rule
        });
    },

    'rule exists': function (t) {
        mod_rule.localEquals(t, [ d.rule ], 'rule added');
        return t.done();
    },

    'update': function (t) {
        d.rule.rule = fmt('FROM any TO vm %s ALLOW udp PORT 9091',
            mod_uuid.v4());

        mod_rule.apiUpdate(t, {
            rule: d.rule
        });
    },

    'rule updated': function (t) {
        mod_rule.localEquals(t, [ d.rule ], 'rule updated');
        return t.done();
    }
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};
