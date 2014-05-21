/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * vm.update task unit tests
 */

var h = require('./helpers');
var mod_cache = require('../lib/cache');
var mod_rule = require('../lib/rule');
var mod_uuid = require('node-uuid');
var mod_vm = require('../lib/vm');



// --- Globals



var agent;
var owners = [ mod_uuid.v4() ];
var d = {
    cache: {},
    rules: [],
    rvms: [],
    vms: [
        h.vm(),
        h.vm({ owner_uuid: owners[0] }),
        h.vm({ owner_uuid: owners[0], tags: { web: true } })
    ]
};



// --- Setup



exports.setup = function (t) {
    h.createAgent(t, true, function (err, a) {
        agent = a;
        return t.done();
    });
};



// --- Tests



exports['update firewall_enabled'] = {
    'setup': function (t) {
        d.rules.push(h.rule({
            created_by: 'fwapi',
            owner_uuid: owners[0],
            rule: 'FROM tag web = true TO tag private = true ALLOW tcp PORT 22'
        }));

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
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');
        t.deepEqual(agent.cache.cache, d.cache, 'cache empty');

        d.vms.push(h.vm({
            firewall_enabled: false,
            local: true,
            owner_uuid: owners[0],
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
        mod_vm.add(t, d.vms[0]);
    },

    'after vm add': function (t) {
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');
        t.deepEqual(agent.cache.cache, d.cache, 'cache empty');

        return t.done();
    },

    'update local vm with firewall enabled': function (t) {
        d.vms[d.vms.length - 1].firewall_enabled = true;
        h.set({
            resolve: [ {
                allVMs: false,
                owner_uuid: owners[0],
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
        t.deepEqual(h.localRules(), [ d.rules[0] ], 'rule added');
        t.deepEqual(h.localRVMs(), [ h.vmToRVM(d.vms[2]) ], 'remote VM added');
        t.equal(h.vmapiReqs().length, 1, '1 request made to VMAPI');

        mod_cache.addTag(d.cache, owners[0], 'web', 'true');
        t.deepEqual(agent.cache.cache, d.cache, 'tag web=true added to cache');

        return t.done();
    }
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};
