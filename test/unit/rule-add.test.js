/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * add-rule task unit tests
 */

var h = require('./helpers');
var mod_cache = require('../lib/cache');
var mod_rule = require('../lib/rule');
var mod_uuid = require('node-uuid');
var mod_vm = require('../lib/vm');
var util = require('util');



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
        return t.done();
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

    h.send('fw.add_rule', null, function (msg) {
        // A message received event will not be emitted, since the message
        // should be ignored
        t.ok(!msg, 'message not received');

        mod_rule.localEquals(t, d.exp.rules, 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');
        t.deepEqual(agent.cache.cache, d.exp.cache, 'cache empty');

        return t.done();
    });
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};
