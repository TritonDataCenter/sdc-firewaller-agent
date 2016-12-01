/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * VM helpers
 */

'use strict';

var assert = require('assert-plus');
var h = require('../unit/helpers');
var fwHelper = require('../../node_modules/fw/test/lib/helpers');
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


function ipfRule(t, opts) {
    assert.object(t, 't');
    assert.object(opts, 'opts');
    assert.object(opts.vm, 'opts.vm');
    assert.string(opts.vm.uuid, 'opts.vm.uuid');

    var ipfConfs = fwHelper.zoneIPFconfigs(4);
    var cur = ipfConfs;
    var curStr;
    // XXX: allow setting pass / block
    var subProps = [ opts.vm.uuid, opts.direction, 'pass', opts.proto,
        opts.target ];
    for (var p in subProps) {
        cur = cur[subProps[p]];
        curStr = curStr ? (curStr + '.' + subProps[p]) : subProps[p];

        if (!cur) {
            if (opts.doesNotExist) {
                // We don't want the sub-object to exist: pass this test
                // and move on
                t.equal(cur, undefined, curStr + ' not found');
            } else {
                // We wanted this subobject to exist, but it didn't: output
                // all of the ipf configs to aid in diagnosis
                t.deepEqual(ipfConfs, {}, curStr + ' not found');
            }

            return;
        }
    }

    curStr = curStr + ', port ' + opts.port;
    // The ports are stored as strings, unfortunately:
    var portIdx = cur.indexOf(opts.port.toString());
    if (opts.doesNotExist) {
        if (portIdx === -1) {
            t.ok(true, curStr + ' not found');
        } else {
            t.deepEqual(ipfConfs, {}, curStr + ' found');
        }

    } else {
        if (portIdx === -1) {
            t.deepEqual(ipfConfs, {}, curStr + ' not found');
        } else {
            t.ok(true, curStr + ' found');
        }
    }
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
    ipfRule: ipfRule,
    localEquals: localEquals,
    update: update,
    setListError: mocks._setVmadmListError
};
