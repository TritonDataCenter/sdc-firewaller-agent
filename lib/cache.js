/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * VM "cache", intended to keep a record of information we've fetched from
 * VMAPI to avoid having to repeatedly query for data that's already present.
 *
 * This is really many sub-caches, segmented by owner_uuid, since adding a
 * rule for user A with tag foo shouldn't fetch all VMs with tag foo; only
 * user A's VMs are needed.
 *
 * The cache stores data for VM properties found in rules:
 * - tags, eg: "FROM tag foo = bar TO ..." or "FROM tag baz TO ..."
 * - vms, eg: "FROM vm <uuid> TO ..."
 * - all vms, eg: "FROM all vms TO ..."
 */

var prim = require('jsprim');
var util = require('util');


// --- Internal



/**
 * Returns true if the tag can be satisfied by the owner's cache
 */
function tagInOwnerCache(oCache, t, val) {
    if (!oCache.tags.hasOwnProperty(t)) {
        return false;
    }

    // We have all tag values for this tag - return true regardless of
    // whether we're looking for all tags or a specific value
    if (oCache.tags[t].all) {
        return true;
    }

    if (oCache.tags[t].values.hasOwnProperty(val)) {
        return true;
    }

    return false;
}



// --- Exports



/**
 * VMCache object constructor
 */
function VMCache() {
    var self = this;
    this.clear();

    this.__defineGetter__('state', function () {
        return self.cache;
    });
}


/**
 * Create an empty cache for the owner. Don't overwrite the existing owner
 * cache unless overwrite is set to true.
 */
VMCache.prototype._addOwner = function addOwner(owner, overwrite) {
    overwrite = !!overwrite;
    if (overwrite || !this.cache.hasOwnProperty(owner)) {
        this.cache[owner] = {
            allVMs: false,
            tags: {},
            vms: {}
        };
    }
};


/**
 * Set the allVMs attribute for an owner's cache - in other words, we have
 * data for all of their remote VMs.
 */
VMCache.prototype.allVMs = function allVMs(owner) {
    this._addOwner(owner, true);
    this.cache[owner].allVMs = true;
};


/**
 * Remove all data from the cache.
 */
VMCache.prototype.clear = function clear() {
    this.cache = {};
};


/**
 * Add data resolved from VMAPI
 */
VMCache.prototype.addResolveData = function addResolveData(resolved) {
    if (resolved.allVMs) {
        this.allVMs(resolved.owner_uuid);
    }

    this.addTags(resolved.owner_uuid, resolved.tags);
    this.addVMs(resolved.owner_uuid, resolved.vms);
};


/**
 * Add tags to the owner's cache. The tags will be stored in each owner's cache
 * with a format like:
 *   tags: {
 *     "tag one key" : {
 *       values: {
 *         "value 1": 1,
 *         "value 2" :1
 *       },
 *     "tag two key": {
 *       // set if we have values for all tags with this key, eg: for rules
 *       // like "FROM tag foo TO ..."
 *       all: true
 *     }
 *   }
 */
VMCache.prototype.addTags = function addTags(owner, tags) {
    if (!tags || prim.isEmpty(tags)) {
        return;
    }

    if (!owner) {
        return;
    }

    this._addOwner(owner);
    var oTags = this.cache[owner].tags;

    for (var k in tags) {
        if (!oTags.hasOwnProperty(k)) {
            oTags[k] = { values: {} };
        }

        if (tags[k] === true) {
            oTags[k].all = true;
            // We have all tag values already, so no sense in keeping the
            // individual values in the cache:
            oTags[k].values = {};

        } else {
            // fw.remoteTargets() can return "tag key: "val", so compensate
            // for that:
            var tagVals = util.isArray(tags[k]) ? tags[k] : [tags[k]];
            for (var v in tagVals) {
                oTags[k].values[tagVals[v]] = 1;
            }
        }
    }
};


/**
 * Add VMs to the owner's cache. The vms portion of that owner's cache will
 * look like:
 *   vms: {
 *     "<VM 1 UUID>": 1,
 *     "<VM 2 UUID>": 1
 *   }
 */
VMCache.prototype.addVMs = function addVMs(owner, vms) {
    if (!vms || vms.length === 0) {
        return;
    }

    if (!owner) {
        return;
    }

    this._addOwner(owner);
    for (var v in vms) {
        this.cache[owner].vms[vms[v]] = 1;
    }
};


/**
 * For the given owner and targets, determine which targets are missing in
 * the cache.
 *
 * - owner {UUID} : owner UUID to filter by
 * - targets {Object} : targets to find in cache, which can include the
 *   following prpoerties:
 *   - allVMs {Boolean} : all VMs
 *   - tags {Object} : key / val of tag. If val is true, this means all tags
 *     with that key
 *   - vms {Array of UUIDs} : VMs
 *
 * Returns: object with any
 */
VMCache.prototype.missing = function _missing(owner, targets) {
    if (!this.cache.hasOwnProperty(owner)) {
        return targets;
    }

    var missing = {};
    var oCache = this.cache[owner];
    var v;

    if (oCache.allVMs) {
        // We already have all remote VMs for this owner, so nothing can be
        // missing
        return missing;
    }

    if (targets.allVMs && !oCache.allVMs) {
        missing.allVMs = true;
    }

    for (var t in targets.tags) {
        var tagVals = targets.tags[t];
        if (!util.isArray(tagVals)) {
            tagVals = [ targets.tags[t] ];
        }

        for (v in tagVals) {
            var val = tagVals[v];
            var found = tagInOwnerCache(oCache, t, val);

            if (!found) {
                if (!missing.hasOwnProperty('tags')) {
                    missing.tags = {};
                }

                if (val === true || missing.tags[t] === true) {
                    missing.tags[t] = true;
                } else {
                    if (!missing.tags.hasOwnProperty(t)) {
                        missing.tags[t] = [];
                    }

                    missing.tags[t].push(val);
                }
            }
        }
    }

    for (v in targets.vms) {
        if (!oCache.vms.hasOwnProperty(targets.vms[v])) {
            if (!missing.hasOwnProperty('vms')) {
                missing.vms = {};
            }
            missing.vms[targets.vms[v]] = 1;
        }
    }

    if (missing.hasOwnProperty('vms')) {
        missing.vms = Object.keys(missing.vms).sort();
    }

    return missing;
};



module.exports = {
    VMCache : VMCache
};
