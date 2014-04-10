/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * vm.add task unit tests
 */

var h = require('./helpers');
var mod_uuid = require('node-uuid');



// --- Globals



var agent;
var owners = [ mod_uuid.v4() ];
var d = {
    cache: {},
    rules: [],
    rvms: [],
    vms: [
        h.vm(),
        h.vm({ owner_uuid: owners[0], tags: { role: 'db' } }),
        h.vm({ owner_uuid: owners[0] }),
        h.vm({ owner_uuid: owners[0], tags: { role: 'qa' } }),
        h.vm({ owner_uuid: owners[0], tags: { role: 'test' } })
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



exports['add'] = {
    'setup': function (t) {
        d.rules.push(h.rule({
            created_by: 'fwapi',
            description: 'allow pings to all VMs',
            global: true,
            rule: 'FROM any TO all vms ALLOW icmp TYPE 8 CODE 0'
        }));

        d.rules.push(h.rule({
            created_by: 'fwapi',
            owner_uuid: owners[0],
            rule: 'FROM tag role = db TO tag role = www ALLOW tcp PORT 80'
        }));

        d.rules.push(h.rule({
            created_by: 'fwapi',
            owner_uuid: owners[0],
            rule: 'FROM tag role = test TO tag role = qa ALLOW tcp PORT 8080'
        }));

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        return t.done();
    },

    'add global rule: no local VMs': function (t) {
        h.send('fw.add_rule', d.rules[0], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    // There are no local VMs, so the rules should not be added

    'after adding global rule': function (t) {
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');

        return t.done();
    },

    'add tag rule: no local VMs': function (t) {
        h.send('fw.add_rule', d.rules[0], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'after adding tag rule': function (t) {
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');

        return t.done();
    },

    // There are no rules on this node, so the VM should not be added:

    'add vm': function (t) {
        h.send('vm.add', d.vms[0], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'after first vm.add': function (t) {
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');

        return t.done();
    },

    'add local vm': function (t) {
        var vm = h.vm({
            local: true,
            owner_uuid: owners[0],
            tags: { role: 'www' }
        });
        // Should be d.vms[5]
        d.vms.push(vm);
        d.idx = d.vms.length - 1;

        var resolve = [
            {
                allVMs: false,
                owner_uuid: owners[0],
                rules: [ d.rules[0], d.rules[1] ],
                tags: {
                    role: 'db'
                },
                vms: []
            }
        ];
        h.set({
            fwapiRules: d.rules,
            resolve: resolve,
            vms: d.vms
        });

        h.send('vm.add', vm, function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    // Adding this local VM should cause both rules to be added, as well as the
    // other (non-local) remote VM

    'after adding VM': function (t) {
        h.equalSorted(t, h.localRules(), [ d.rules[0], d.rules[1] ],
            'rules added');
        t.deepEqual(h.localRVMs(), [ h.vmToRVM(d.vms[1]) ],
            'remote VM added');

        d.cache[owners[0]] = {
            allVMs: false,
            tags: {
                role: {
                    values: {
                        db: 1
                    }
                }
            },
            vms: {}
        };

        t.deepEqual(agent.cache.cache, d.cache, 'tags added to cache');
        t.equal(h.vmapiReqs().length, 1, '1 request made to VMAPI');

        var resolveReqs = h.fwapiReqs();
        d.resolve = [ {
            owner_uuid: owners[0],
            vms: [ d.vms[d.idx].uuid ],
            tags: {
                role: [ 'www' ]
            }
        } ];

        t.deepEqual(resolveReqs.resolve, d.resolve,
            'resolve request');

        return t.done();
    },

    // Update the local VM: this should add the rule that refers to the
    // new role, and the remote VMs from the other side of the rule

    'update local vm': function (t) {
        d.vms[d.idx].tags = { role: 'qa' };

        var resolve = [
            {
                allVMs: false,
                owner_uuid: owners[0],
                rules: [ d.rules[0], d.rules[2] ],
                tags: {
                    role: 'test'
                },
                vms: []
            }
        ];
        h.set({
            fwapiRules: d.rules,
            resolve: resolve,
            vms: d.vms
        });

        h.send('vm.update', d.vms[d.idx], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'after updating VM': function (t) {
        h.equalSorted(t, h.localRules(), d.rules, 'rules added');
        h.equalSorted(t, h.localRVMs(), h.vmToRVM([ d.vms[1], d.vms[4] ]),
            'remote VM added');

        d.cache[owners[0]] = {
            allVMs: false,
            tags: {
                role: {
                    values: {
                        db: 1,
                        test: 1
                    }
                }
            },
            vms: {}
        };

        t.deepEqual(agent.cache.cache, d.cache, 'tags added to cache');
        t.equal(h.vmapiReqs().length, 2, '1 more request made to VMAPI');

        var resolveReqs = h.fwapiReqs();
        d.resolve.push({
            owner_uuid: owners[0],
            vms: [ d.vms[d.idx].uuid ],
            tags: {
                role: [ 'qa' ]
            }
        });

        t.deepEqual(resolveReqs.resolve, d.resolve,
            'one more resolve request made');

        return t.done();
    }
};


// XXX: add VM without firewall_enabled


// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};
