/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * rule helpers
 */

var assert = require('assert-plus');
var h = require('../unit/helpers');
var mocks = require('../unit/mocks');



// --- Exports



/**
 * Sends an add_rule rule message, confirms it was received, and ends the test.
 */
function addRule(t, rule, callback) {
    h.send('fw.add_rule', rule, function (err, msg) {
        t.ok(msg, 'message received');

        if (callback) {
            return callback(err, msg);
        }

        return t.done();
    });
}


/**
 * Updates a rule via the REST API
 */
function apiUpdateRule(t, opts, callback) {
    assert.object(t, 't');
    assert.object(opts, 'opts');
    assert.object(opts.rule, 'opts.rule');

    var client = h.getClient();
    var putOpts = { path: '/rules/' + opts.rule.uuid };

    client.put(putOpts, opts.rule, function _afterUpdate(err, req, res, obj) {
        // XXX: allow opts.expErr
        t.ifError(err, 'update rule');

        if (err) {
            if (callback) {
                return callback(err);
            }

            return t.done();
        }

        if (opts.fillInMissing) {
            [ 'created_by', 'version' ].forEach(function (f) {
                if (!opts.rule.hasOwnProperty(f)) {
                    opts.rule[f] = obj[f];
                }
            });
        }

        t.deepEqual(obj, opts.rule, 'result');

        if (callback) {
            return callback(err, obj);
        }

        return t.done();
    });
}


/**
 * Sends a del_rule message, confirms it was received, and ends the test.
 */
function delRule(t, rule, callback) {
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
function updateRule(t, rule, callback) {
    h.send('fw.update_rule', rule, function (err, msg) {
        t.ok(msg, 'message received');

        if (callback) {
            return callback(err, msg);
        }

        return t.done();
    });
}



module.exports = {
    add: addRule,
    apiUpdate: apiUpdateRule,
    del: delRule,
    fwapiEquals: fwapiEquals,
    localEquals: localEquals,
    update: updateRule
};
