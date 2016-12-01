/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * add-rule task unit tests
 */

'use strict';

var h = require('./helpers');
var mod_cache = require('../lib/cache');
var mod_rule = require('../lib/rule');
var mod_uuid = require('uuid');
var mod_vm = require('../lib/vm');




// --- Globals



var agent;
var owners = [ mod_uuid.v4() ];
var d = {
    exp: {
        cache: {},
        rules: [],
        rvms: []
    },
    rules: [],
    rvms: [],
    vms: []
};



// --- Setup



exports.setup = function (t) {
    h.createAgent(t, true, function (err, a) {
        agent = a;
        t.ifError(err, 'createAgent() error');
        t.ok(agent, 'agent created');
        t.done();
    });
};



// --- Tests



/*
 * Send an empty rule - this should be ignored by the agent
 */
exports['missing rule sent'] = function (t) {
    d.vms = [];
    d.rules = [];

    h.set({
        fwapiRules: d.rules,
        vms: d.vms
    });

    h.send('fw.add_rule', null, function (err, msg) {
        // A message received event will not be emitted, since the message
        // should be ignored
        t.ok(!msg, 'message not received');
        t.ok(err, 'timeout error returned');
        if (err) {
            t.equal(err.message, 'timed out', 'correct error');
        }

        mod_rule.localEquals(t, d.exp.rules, 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');
        t.deepEqual(agent.cache.cache, d.exp.cache, 'cache empty');

        return t.done();
    });
};


exports['multiple tags'] = {
    'setup': function (t) {
        d.vms = [
            // Local VM
            h.vm({ owner_uuid: owners[0], local: true, tags: { couch: 1 } }),
            h.vm({ owner_uuid: owners[0], tags: { couch: 2 } })
        ];

        d.rules = [
            h.rule({
                created_by: 'fwapi',
                enabled: true,
                owner_uuid: owners[0],
                rule: 'FROM (tag "couch" = "1" OR tag "couch" = "2") TO '
                    + '(tag "couch" = "1" OR tag "couch" = "2") ALLOW '
                    + 'tcp PORT 5984'
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
    'add rule: vm 0 local': function (t) {
        mod_rule.add(t, d.rules[0], function (err, msg) {
            t.ifError(err, 'error returned');
            if (err) {
                t.done();
                return;
            }

            t.ok(msg, 'message returned');

            d.exp.rules = [ d.rules[0] ];
            d.exp.rvms = [ h.vmToRVM(d.vms[1]) ];

            mod_rule.localEquals(t, d.exp.rules, 'rule added');
            t.deepEqual(h.localRVMs(), d.exp.rvms, 'remote VM 1 added');

            mod_cache.addTag(d.exp.cache, owners[0], 'couch', '1');
            mod_cache.addTag(d.exp.cache, owners[0], 'couch', '2');
            t.deepEqual(agent.cache.cache, d.exp.cache, 'tags cached');

            t.equal(h.vmapiReqs().length, 1, '1 request made to VMAPI');
            t.deepEqual(h.lastVmapiReq(), h.vmapiReq({
                owner_uuid: owners[0],
                tags: [
                    [ 'couch', '1' ],
                    [ 'couch', '2' ]
                ]
            }), 'VMAPI request');
            t.done();
        });
    },

    // Now set vms[1] as the local VM

    'reset': function (t) {
        d.vms = [
            h.vm({ owner_uuid: owners[0], tags: { couch: 1 } }),
            // Local VM
            h.vm({ owner_uuid: owners[0], local: true, tags: { couch: 2 } })
        ];

        h.reset();
        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });
        agent.cache.clear();

        mod_rule.localEquals(t, [], 'rule removed by reset');
        t.deepEqual(h.localRVMs(), [], 'remote VMs removed by reset');
        return t.done();
    },

    'add rule: vm 1 local': function (t) {
        mod_rule.add(t, d.rules[0], function (err, msg) {
            t.ifError(err, 'error returned');
            if (err) {
                t.done();
                return;
            }

            t.ok(msg, 'message returned');

            d.exp.rules = [ d.rules[0] ];
            d.exp.rvms = [ h.vmToRVM(d.vms[0]) ];

            mod_rule.localEquals(t, d.exp.rules, 'rule added');
            t.deepEqual(h.localRVMs(), d.exp.rvms, 'remote VM 1 added');

            mod_cache.addTag(d.exp.cache, owners[0], 'couch', '1');
            mod_cache.addTag(d.exp.cache, owners[0], 'couch', '2');
            t.deepEqual(agent.cache.cache, d.exp.cache, 'tags cached');

            t.equal(h.vmapiReqs().length, 2, 'second request made to VMAPI');
            t.deepEqual(h.lastVmapiReq(), h.vmapiReq({
                owner_uuid: owners[0],
                tags: [
                    [ 'couch', '1' ],
                    [ 'couch', '2' ]
                ]
            }), 'VMAPI request');
            t.done();
        });
    }
};


exports['vmadm list error'] = function (t) {
    var errMsg = 'ENOENT: something';
    mod_vm.setListError(new Error(errMsg));
    var rule = h.rule({
        owner_uuid: owners[0],
        rule: 'FROM any TO all vms ALLOW udp PORT 5432'
    });

    mod_rule.add(t, rule, function (err) {
        t.ok(err, 'error returned');
        if (err) {
            t.equal(err.message, errMsg, 'error message');
        }

        return t.done();
    });
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};
