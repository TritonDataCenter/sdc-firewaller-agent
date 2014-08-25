/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * sync task unit tests
 */

var extend = require('xtend');
var h = require('./helpers');
var mod_rule = require('../lib/rule');
var mod_rvm = require('../lib/rvm');
var mod_uuid = require('node-uuid');
var mod_vm = require('../lib/vm');



// --- Globals



var agent;
var exp = {
    fwapiRules: [],
    localRules: [],
    rvms: []
};
var resolve = [];
var rules = {};
var vms = {};



// --- Helper functions



function sync(t) {
    agent.sync(function (err) {
        t.ifError(err);
        return t.done();
    });
}



// --- Setup



exports.setup = function (t) {
    h.createAgent(t, function (a) {
        agent = a;
        return t.done();
    });
};



// --- Tests



/**
 * Empty CN: no VMs, rules or RVMs
 */
exports['empty CN'] = {
    'sync': function (t) {
        resolve = [
            {
                allVMs: false,
                owner_uuid: h.OWNER_UUID,
                rules: [],
                tags: { },
                vms: []
            }
        ];

        vms = [
            h.vm({ uuid: h.uuid(0), owner_uuid: h.OWNER_UUID }),
            h.vm({ uuid: h.uuid(1), owner_uuid: h.OWNER_UUID })
        ];

        h.set({
            fwapiRules: [ ],
            localRules: [ ],
            localRVMs: [ ],
            resolve: resolve,
            vms: vms
        });

        mod_rule.fwapiEquals(t, [ ], 'no FWAPI rules');
        mod_rule.localEquals(t, [ ], 'no local rules');
        mod_rvm.localEquals(t, [ ], 'no local RVMs');
        mod_vm.localEquals(t, [ ], 'no local VMs');

        sync(t);
    },

    'results': function (t) {
        mod_rule.fwapiEquals(t, [ ], 'FWAPI rules');
        mod_rule.localEquals(t, [ ], 'local rules');
        mod_rvm.localEquals(t, [ ], 'local RVMs');

        return t.done();
    }
};


/**
 * VMs, rules and RVMs on CN, but not in FWAPI and VMAPI: since the APIs are
 * the definitive source, this should result in all local rules and RVMs
 * being deleted.
 */
exports['empty FWAPI / VMAPI'] = {
    'sync': function (t) {
        resolve = [
            {
                allVMs: false,
                owner_uuid: h.OWNER_UUID,
                rules: [],
                tags: {},
                vms: []
            }
        ];

        vms = [
            h.vm({ uuid: h.uuid(0), local: true, owner_uuid: h.OWNER_UUID }),
            h.vm({ uuid: h.uuid(1), owner_uuid: h.OWNER_UUID }),
            h.vm({ uuid: h.uuid(2), owner_uuid: mod_uuid.v4() }),
            h.vm({ uuid: h.uuid(3), owner_uuid: h.OWNER_UUID }),
            h.vm({ uuid: h.uuid(4), owner_uuid: mod_uuid.v4() })
        ];

        rules.local = [
            h.rule({
                created_by: 'fwapi',
                owner_uuid: h.OWNER_UUID,
                rule: 'FROM ip 170.0.0.1 TO all vms ALLOW tcp PORT 81',
                version: '1'
            }),
            h.rule({
                created_by: 'fwapi',
                owner_uuid: mod_uuid.v4(),
                rule: 'FROM ip 170.0.0.2 TO all vms ALLOW tcp PORT 82',
                version: '1'
            })
        ];

        h.set({
            fwapiRules: [],
            localRules: rules.local,
            localRVMs: [ vms[3], vms[4] ],
            resolve: resolve,
            vms: vms
        });

        mod_rule.fwapiEquals(t, [], 'FWAPI rules');
        mod_rule.localEquals(t, rules.local, 'local rules');
        mod_rvm.localEquals(t, [ vms[3], vms[4] ], 'local RVMs');
        mod_vm.localEquals(t, [ vms[0] ], 'local VMs');

        sync(t);
    },

    'results': function (t) {
        mod_rule.fwapiEquals(t, [], 'FWAPI rules');
        mod_rule.localEquals(t, [], 'local rules');
        mod_rvm.localEquals(t, [], 'local RVMs');

        return t.done();
    }
};


/**
 * Test that:
 * - If there is a newer version of the rule in FWAPI, it gets pulled down
 * - If there is a local rule that was not created by FWAPI, it gets pushed
 *   back to FWAPI
 * - If there is a local rule that was created by FWAPI but no longer exists
 *   in FWAPI, it gets deleted
 * - If there are remote VMs that were not resolved from VMAPI, they get
 *   deleted
 */
exports['fwapi versions override'] = {
    'sync': function (t) {
        rules = {};
        var bothRule = h.rule({
            created_by: 'fwapi',
            owner_uuid: h.OWNER_UUID,
            rule: 'FROM ip 172.0.0.1 TO all vms ALLOW tcp PORT 81'
        });

        rules.local = [
            // Older version than the FWAPI rule
            extend(bothRule, { version: '1' }),

            // Created locally: not in FWAPI
            h.rule({
                owner_uuid: h.OWNER_UUID,
                rule: 'FROM ip 172.0.0.2 TO all vms ALLOW tcp PORT 82',
                version: '1'
            }),

            // Formerly in FWAPI, now only here: these two are deleted rules
            // that were missed on this CN
            h.rule({
                created_by: 'fwapi',
                owner_uuid: h.OWNER_UUID,
                rule: 'FROM ip 172.0.0.3 TO all vms ALLOW tcp PORT 83',
                version: '1'
            }),
            h.rule({
                created_by: 'fwapi',
                owner_uuid: mod_uuid.v4(),
                rule: 'FROM ip 172.0.0.4 TO all vms ALLOW tcp PORT 84',
                version: '1'
            })
        ];

        rules.fwapi = [
            // Newer version than the CN rule
            extend(bothRule, { created_by: 'fwapi', version: '2' }),

            // In FWAPI only
            h.rule({
                owner_uuid: h.OWNER_UUID,
                rule: 'FROM tag something = else TO all vms ALLOW tcp PORT 85',
                created_by: 'fwapi'
            })
        ];

        resolve = [
            {
                allVMs: false,
                owner_uuid: h.OWNER_UUID,
                rules: rules.fwapi,
                tags: {
                    something: [ 'else' ]
                },
                vms: []
            }
        ];

        vms = [
            h.vm({ uuid: h.uuid(0), local: true }),
            h.vm({
                uuid: h.uuid(1),
                owner_uuid: h.OWNER_UUID,
                tags: { something: 'else' }
            }),
            // On local server
            h.vm({
                uuid: h.uuid(2),
                owner_uuid: h.OWNER_UUID,
                tags: { something: 'else' }
            }),
            // On local server
            h.vm({ uuid: h.uuid(3), owner_uuid: h.OWNER_UUID }),
            // On local server
            h.vm({ uuid: h.uuid(4), owner_uuid: mod_uuid.v4() }),
            h.vm({ uuid: h.uuid(5), owner_uuid: mod_uuid.v4() })
        ];

        h.set({
            fwapiRules: rules.fwapi,
            localRules: rules.local,
            localRVMs: [ vms[2], vms[3], vms[4] ],
            resolve: resolve,
            vms: vms
        });

        mod_rule.localEquals(t, rules.local, 'local rules');
        mod_rvm.localEquals(t, [ vms[2], vms[3], vms[4] ], 'local RVMs');

        sync(t);
    },

    'after first sync': function (t) {
        var newLocal1 = extend(rules.local[1], { created_by: 'fwapi' });

        exp.fwapiRules = [
            newLocal1,
            rules.fwapi[0],
            rules.fwapi[1]
        ];
        exp.localRules = [
            newLocal1,
            rules.fwapi[0],
            rules.fwapi[1]
        ];
        // This should be set to only the VMs that were resolved from VMAPI:
        // locally added RVMs are not permitted (since VMAPI should know about
        // all VMs in the DC).
        exp.rvms = [ vms[1], vms[2] ];

        mod_rule.fwapiEquals(t, exp.fwapiRules, 'FWAPI rules');
        mod_rule.localEquals(t, exp.localRules, 'local rules');
        mod_rvm.localEquals(t, exp.rvms, 'local RVMs');

        return t.done();
    },

    /*
     * Sync again - everything should stay the same
     */
    'second sync': function (t) {
        // We have a new rule in FWAPI - resolve needs to return it
        resolve[0].rules = exp.fwapiRules;

        h.set({
            fwapiRules: exp.fwapiRules,
            resolve: resolve,
            vms: vms
        });

        sync(t);
    },

    'after second sync': function (t) {
        mod_rule.fwapiEquals(t, exp.fwapiRules, 'FWAPI rules');
        mod_rule.localEquals(t, exp.localRules, 'local rules');
        mod_rvm.localEquals(t, exp.rvms, 'local RVMs');

        return t.done();
    }
};



// --- Tests


exports.teardown = function (t) {
    h.teardown(t);
};
