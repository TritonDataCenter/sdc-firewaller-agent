/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * rule helpers
 */

var h = require('../unit/helpers');


/**
 * Adds a rule, confirms it was received, and ends the test.
 */
function add(t, rule) {
    h.send('fw.add_rule', rule, function (msg) {
        t.ok(msg, 'message received');
        return t.done();
    });
}


/**
 * Confirms the local list of rules is equal to the given list
 */
function localEquals(t, exp, desc) {
    h.equalSorted(t, h.localRules(), exp, desc);
}



module.exports = {
    add: add,
    localEquals: localEquals
};
