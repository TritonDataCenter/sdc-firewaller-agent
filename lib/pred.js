/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Functions for creating VMAPI predicates
 */

var assert = require('assert-plus');
var prim = require('jsprim');
var util = require('util');



// --- Exports


/**
 * The base filter: all active VMs owned by owner_uuid and not on this
 * server.  Don't get data for VMs in a state where they have no
 * IPs: destroyed, failed, provisioning
 */
function allVMsFilt(params) {
    return {
        and: [
            eqFilt('owner_uuid', params.owner_uuid),
            neFilt('server_uuid', params.serverUUID),
            neFilt('state', 'destroyed'),
            neFilt('state', 'failed'),
            neFilt('state', 'provisioning')
        ]
    };
}


/**
 * Filter: (key=val)
 */
function eqFilt(key, val) {
    return { eq: [ key, val ] };
}


/**
 * Filter: (!(key=val))
 */
function neFilt(key, val) {
    return { ne: [ key, val ] };
}


/**
 * Creates a predicate suitable for passing to VMAPI's listVMs endpoint,
 * based on the following parameters in params:
 *
 * Required:
 * - owner_uuid :  match only VMs for this owner
 * - serverUUID : used to filter out VMs on this server (since we will never
 *   need to add "remote" VMs that are on this server)
 *
 * Optional:
 * - allVMs : if set, will fetch all VMs for the given owner_uuid. This
 *   (obviously) overrides the tags and vms filters
 * - tags : tags to filter by
 * - vms : array of VM UUIDs to filter by
 */
function createPred(params) {
    assert.object(params, 'params');
    assert.string(params.owner_uuid, 'params.owner_uuid');
    assert.string(params.serverUUID, 'params.serverUUID');

    var allFilt = allVMsFilt(params);
    var tags = params.tags || {};
    var vms = params.vms || [];

    if (params.allVMs || (prim.isEmpty(tags) && vms.length === 0)) {
        return allFilt;
    }

    var orFilter = [];
    var t;
    var v;

    for (t in tags) {
        if (util.isArray(tags[t])) {
            var vals = tags[t];
            for (v in vals) {
                orFilter.push(eqFilt('tag.' + t, vals[v]));
            }
        } else {
            if (tags[t] === true) {
                orFilter.push(eqFilt('tag.' + t, '*'));
            } else {
                orFilter.push(eqFilt('tag.' + t, tags[t]));
            }
        }
    }

    vms.forEach(function (vm) {
        orFilter.push(eqFilt('uuid', vm));
    });

    if (orFilter.length === 0) {
        return allFilt;
    }

    if (orFilter.length === 1) {
        // OR filters require at least two sub-elements
        allFilt.and.push(orFilter[0]);
    } else {
        allFilt.and.push({ or: orFilter});
    }

    return allFilt;
}



module.exports = {
    create: createPred,
    filt: {
        allVMs: allVMsFilt,
        eq: eqFilt,
        ne: neFilt
    }
};
