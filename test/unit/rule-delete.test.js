/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * del-rule task unit tests
 */

'use strict';

var h = require('./helpers');
var mod_rule = require('../lib/rule');
var mod_uuid = require('uuid');
var mod_vm = require('../lib/vm');



// --- Globals



var agent;



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



exports['vmadm list error'] = function (t) {
    var errMsg = 'ENOENT: something';
    mod_vm.setListError(new Error(errMsg));
    var rule = h.rule({
        owner_uuid: mod_uuid.v4(),
        rule: 'FROM any TO all vms ALLOW udp PORT 5432'
    });

    mod_rule.del(t, rule, function (err) {
        t.ok(err, 'error returned');
        if (err) {
            t.equal(err.message, errMsg, 'error message');
        }

        t.done();
    });
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};
