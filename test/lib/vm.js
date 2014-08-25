/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * VM helpers
 */

var h = require('../unit/helpers');
var mocks = require('../unit/mocks');



// --- Exports



/**
 * Adds a VM, confirms it was received, and ends the test.
 */
function add(t, vm, callback) {
    h.send('vm.add', vm, function (err, msg) {
        t.ok(msg, 'message received');
        if (callback) {
            return callback(err, msg);
        }

        return t.done();
    });
}


/**
 * Adds a VM, confirms it was received, and ends the test.
 */
function del(t, vm, callback) {
    h.send('vm.delete', vm, function (err, msg) {
        t.ok(msg, 'message received');
        if (callback) {
            return callback(err, msg);
        }

        return t.done();
    });
}


/**
 * Confirms the local list of VMs is equal to the given list
 */
function localEquals(t, exp, desc) {
    h.equalSorted(t, mocks._localVMs(), exp, desc);
}


/**
 * Updates a VM, confirms it was received, and ends the test.
 */
function update(t, vm, callback) {
    h.send('vm.update', vm, function (err, msg) {
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
    localEquals: localEquals,
    update: update,
    setListError: mocks._setVmadmListError
};
