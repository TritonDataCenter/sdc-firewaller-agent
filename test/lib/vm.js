/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * VM helpers
 */

var h = require('../unit/helpers');


/**
 * Adds a VM, confirms it was received, and ends the test.
 */
function add(t, vm) {
    h.send('vm.add', vm, function (msg) {
        t.ok(msg, 'message received');
        return t.done();
    });
}


/**
 * Updates a VM, confirms it was received, and ends the test.
 */
function update(t, vm) {
    h.send('vm.update', vm, function (msg) {
        t.ok(msg, 'message received');
        return t.done();
    });
}


module.exports = {
    add: add,
    update: update
};
