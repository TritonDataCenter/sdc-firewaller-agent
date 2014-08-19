/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * rule helpers
 */

var h = require('../unit/helpers');
var mocks = require('../unit/mocks');


/**
 * Adds a rule, confirms it was received, and ends the test.
 */
function add(t, rule, callback) {
    h.send('fw.add_rule', rule, function (msg) {
        t.ok(msg, 'message received');

        if (callback) {
            return callback(null, msg);
        }

        return t.done();
    });
}


/**
 * Confirms the list of FWAPI rules is equal to the given list
 */
function fwapiEquals(t, exp, desc) {
    var rules = [];
    var fwapiRules = mocks._fwapiRules;
    for (var r in fwapiRules) {
        rules.push(fwapiRules[r]);
    }

    h.equalSorted(t, rules, exp, desc);
}


/**
 * Confirms the local list of rules is equal to the given list
 */
function localEquals(t, exp, desc) {
    h.equalSorted(t, h.localRules(), exp, desc);
}



module.exports = {
    add: add,
    fwapiEquals: fwapiEquals,
    localEquals: localEquals
};
