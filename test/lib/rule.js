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



module.exports = {
    add: add
};
