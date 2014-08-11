/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Tests for adding / updating 'all vms' rules
 */

var fmt = require('util').format;
var h = require('./helpers');
var mod_uuid = require('node-uuid');
var util = require('util');



// --- Globals



var agent;
var owners = [ mod_uuid.v4(), mod_uuid.v4(), mod_uuid.v4() ];
var d = {
    cache: {},
    rules: [],
    rvms: [],
    vms: [
        // 3 local VMs: two owned by us, one by someone else
        h.vm({ local: true, owner_uuid: owners[0] }),
        h.vm({ local: true, owner_uuid: owners[0] }),
        h.vm({ local: true, owner_uuid: owners[1] }),
        // 6 remote VMs
        h.vm({ owner_uuid: owners[0] }),
        h.vm({ owner_uuid: owners[0] }),
        h.vm({ owner_uuid: owners[1], tags: { foo: 'bar' } }),
        h.vm({ owner_uuid: owners[1] }),
        h.vm({ owner_uuid: owners[1] }),
        h.vm({ owner_uuid: owners[2] }),
        h.vm({ owner_uuid: owners[2] })
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



// add-rule tests: these all operate on owners[0]
exports['add'] = {
    'setup': function (t) {
        d.rules.push(h.rule({
            created_by: 'fwapi',
            owner_uuid: owners[0],
            rule: fmt('FROM all vms TO vm %s ALLOW tcp PORT all',
                d.vms[0].uuid)
        }));

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        return t.done();
    },

    'add: rule 0': function (t) {
        h.send('fw.add_rule', d.rules[0], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'results: rule 0': function (t) {
        h.equalSorted(t, h.localRules(), d.rules, 'rule added');

        // The rule is from all vms to a local VM, so it should have
        // fetched all other VMs for this owner from VMAPI
        d.rvms = d.rvms.concat(h.vmToRVM([ d.vms[3], d.vms[4] ]));
        h.equalSorted(t, h.localRVMs(), d.rvms, 'remote VMs added');

        d.cache[owners[0]] = {
            allVMs: true,
            tags: { },
            vms: { }
        };

        t.deepEqual(agent.cache.cache, d.cache, 'allVMs added to cache');
        t.equal(h.vmapiReqs().length, 1, '1 request made to VMAPI');
        t.deepEqual(h.lastVmapiReq(), h.vmapiReq({
            owner_uuid: owners[0]
        }), 'VMAPI query correct');

        return t.done();
    },

    // Add a second rule that also targets all vms. The rule should get added,
    // and we shouldn't hit VMAPI again, since the data for this rule is
    // already in the cache

    'add: rule 1': function (t) {
        d.rules.push(h.rule({
            created_by: 'fwapi',
            owner_uuid: owners[0],
            rule: fmt('FROM all vms TO vm %s ALLOW tcp PORT all',
                d.vms[1].uuid)
        }));

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        h.send('fw.add_rule', d.rules[1], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'results: rule 1': function (t) {
        h.equalSorted(t, h.localRules(), [
            d.rules[0], d.rules[1] ],
            'rule 1 added');

        // The rule is from all vms to a local VM, so it should have
        // fetched all other VMs for this owner from VMAPI
        h.equalSorted(t, h.localRVMs(), d.rvms, 'remote VMs still present');

        t.deepEqual(agent.cache.cache, d.cache, 'cache unchanged');
        t.equal(h.vmapiReqs().length, 1, 'no new requests made to VMAPI');

        return t.done();
    },

    // Add another rule that references a tag.  We shouldn't hit VMAPI again,
    // since we've already fetched all VMs

    'add: rule 2': function (t) {
        d.rules.push(h.rule({
            created_by: 'fwapi',
            owner_uuid: owners[0],
            rule: fmt('FROM tag foo TO vm %s ALLOW tcp PORT all',
                d.vms[1].uuid)
        }));

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        h.send('fw.add_rule', d.rules[2], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'results: rule 2': function (t) {
        h.equalSorted(t, h.localRules(), d.rules, 'rule 2 added');

        // The rule is from all vms to a local VM, so it should have
        // fetched all other VMs for this owner from VMAPI
        h.equalSorted(t, h.localRVMs(), d.rvms, 'remote VMs still present');
        t.deepEqual(agent.cache.cache, d.cache, 'cache unchanged');
        t.equal(h.vmapiReqs().length, 1, 'no new requests made to VMAPI');

        return t.done();
    }
};


// update-rule tests: these all operate on owners[1]
exports['update'] = {
    'setup': function (t) {
        d.rules.push(h.rule({
            created_by: 'fwapi',
            owner_uuid: owners[1],
            rule: fmt('FROM tag foo = bar TO vm %s ALLOW tcp PORT all',
                d.vms[2].uuid)
        }));
        d.idx = d.rules.length - 1;
        d.vmapiIdx = h.vmapiReqs().length;

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        return t.done();
    },

    // First, add the rule
    'add: rule 3': function (t) {
        h.send('fw.add_rule', d.rules[d.idx], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'after adding rule 3': function (t) {
        h.equalSorted(t, h.localRules(), d.rules, 'rule added');

        // The rule is from all vms to a local VM, so it should have
        // fetched all other VMs for this owner from VMAPI
        d.rvms.push(h.vmToRVM(d.vms[5]));
        h.equalSorted(t, h.localRVMs(), d.rvms, 'VM 5 added');

        d.cache[owners[1]] = {
            allVMs: false,
            tags: {
                foo: {
                    values: {
                        bar: 1
                    }
                }
            },
            vms: { }
        };

        t.deepEqual(agent.cache.cache, d.cache, 'tag foo=bar added to cache');
        t.equal(h.vmapiReqs().length, d.vmapiIdx + 1,
            '1 new request made to VMAPI');

        t.deepEqual(h.lastVmapiReq(), h.vmapiReq({
                owner_uuid: owners[1],
                tags: [
                    [ 'foo', 'bar' ]
                ]
            }), 'VMAPI query correct');

        return t.done();
    },

    // Update the rule to add a vm

    'update 1: add vm': function (t) {
        d.rules[d.idx].rule = fmt(
            'FROM (tag foo = bar OR vm %s) TO vm %s ALLOW tcp PORT all',
                d.vms[6].uuid, d.vms[2].uuid);

        h.send('fw.update_rule', d.rules[d.idx], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'after update 1': function (t) {
        h.equalSorted(t, h.localRules(), d.rules, 'rule updated');

        // The rule is from all vms to a local VM, so it should have
        // fetched all other VMs for this owner from VMAPI
        d.rvms.push(h.vmToRVM(d.vms[6]));
        h.equalSorted(t, h.localRVMs(), d.rvms, 'VM 6 added');

        // tags and vms should be empty: they are now covered by allVMs
        d.cache[owners[1]].vms[d.vms[6].uuid] = 1;

        t.deepEqual(agent.cache.cache, d.cache, 'VM 6 added to cache');
        t.equal(h.vmapiReqs().length, d.vmapiIdx + 2,
            '1 new request made to VMAPI');

        t.deepEqual(h.lastVmapiReq(), h.vmapiReq({
            owner_uuid: owners[1],
            vms: [ d.vms[6].uuid ]
        }), 'VMAPI query correct');

        return t.done();
    },

    // Update the rule to add all vms

    'update 2: add all vms': function (t) {
        d.rules[d.idx].rule = fmt(
                'FROM all vms TO vm %s ALLOW tcp PORT all',
                d.vms[2].uuid);

        h.send('fw.update_rule', d.rules[d.idx], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'after update 2': function (t) {
        h.equalSorted(t, h.localRules(), d.rules, 'rule updated');

        // The rule is from all vms to a local VM, so it should have
        // fetched all other VMs for this owner from VMAPI
        d.rvms.push(h.vmToRVM(d.vms[7]));
        h.equalSorted(t, h.localRVMs(), d.rvms, 'VM 7 added');

        // tags and vms should be empty: they are now covered by allVMs
        d.cache[owners[1]] = {
            allVMs: true,
            tags: { },
            vms: { }
        };

        t.deepEqual(agent.cache.cache, d.cache, 'all vms added to cache');
        t.equal(h.vmapiReqs().length, d.vmapiIdx + 3,
            '1 new request made to VMAPI');

        t.deepEqual(h.lastVmapiReq(), h.vmapiReq({
            owner_uuid: owners[1]
        }), 'VMAPI query correct');

        return t.done();
    }
};


// Add an 'all vms' -> 'all vms' global rule. We explicitly don't want to
// pull in all VMs in the datacenter, so this rule has no effect.
exports['add global rule'] = {
    'setup': function (t) {
        d.rules.push(h.rule({
            created_by: 'fwapi',
            global: true,
            rule: 'FROM all vms TO all vms ALLOW tcp PORT 80'
        }));
        d.idx = d.rules.length - 1;
        d.vmapiIdx = h.vmapiReqs().length;

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        return t.done();
    },

    // First, add the rule
    'add: rule 4': function (t) {
        h.send('fw.add_rule', d.rules[d.idx], function (msg) {
            t.ok(msg, 'message received');
            return t.done();
        });
    },

    'after rule 4 add': function (t) {
        h.equalSorted(t, h.localRules(), d.rules, 'rule added');

        // The cache should not have changed, and we should not have hit
        // VMAPI.
        t.deepEqual(agent.cache.cache, d.cache, 'all vms added to cache');
        t.equal(h.vmapiReqs().length, d.vmapiIdx,
            'no more requests made to VMAPI');

        return t.done();
    }
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};
