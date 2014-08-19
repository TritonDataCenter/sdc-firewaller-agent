/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * rule helpers
 */

var h = require('../unit/helpers');
var mocks = require('../unit/mocks');



// --- Exports



/**
 * Sends an add_rule rule message, confirms it was received, and ends the test.
 */
function add(t, rule, callback) {
    h.send('fw.add_rule', rule, function (err, msg) {
        t.ok(msg, 'message received');

        if (callback) {
            return callback(err, msg);
        }

        return t.done();
    });
}


/**
 * Sends a del_rule message, confirms it was received, and ends the test.
 */
function del(t, rule, callback) {
    h.send('fw.del_rule', rule, function (err, msg) {
        t.ok(msg, 'message received');

        if (callback) {
            return callback(err, msg);
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


/**
 * Sends an update_rule message, confirms it was received, and ends the test.
 */
function update(t, rule, callback) {
    h.send('fw.update_rule', rule, function (err, msg) {
        t.ok(msg, 'message received');

        if (callback) {
            return callback(err, msg);
        }

        return t.done();
    });
}



module.exports = {
    add: add,
    del: del,
    fwapiEquals: fwapiEquals,
    localEquals: localEquals,
    update: update
};
