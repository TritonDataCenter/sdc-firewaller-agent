/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * VM cache
 */

var prim = require('jsprim');


// --- Exports



function VMCache() {
    var self = this;
    this.clear();

    this.__defineGetter__('state', function () {
        return self.cache;
    });
}


VMCache.prototype._addOwner = function addOwner(owner) {
    if (!this.cache.hasOwnProperty(owner)) {
        this.cache[owner] = {
            allVMs: false,
            tags: {},
            vms: {}
        };
    }
};


VMCache.prototype.allVMs = function allVMs(owner) {
    this._addOwner(owner);
    this.cache[owner].allVMs = true;
};


VMCache.prototype.clear = function clear() {
    this.cache = {};
};


VMCache.prototype.addResolveData = function addResolveData(resolved) {
    if (resolved.allVMs) {
        this.allVMs(resolved.owner_uuid);
    }

    this.addTags(resolved.owner_uuid, resolved.tags);
    this.addVMs(resolved.owner_uuid, resolved.vms);
};


VMCache.prototype.addTags = function addTags(owner, tags) {
    if (!tags || prim.isEmpty(tags)) {
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
        } else {
            for (var v in tags[k]) {
                oTags[k].values[tags[k][v]] = 1;
            }
        }
    }
};


VMCache.prototype.addVMs = function addVMs(owner, vms) {
    if (!vms || vms.length === 0) {
        return;
    }

    this._addOwner(owner);
    for (var v in vms) {
        this.cache[owner].vms[vms[v]] = 1;
    }
};


VMCache.prototype.missing = function _missing(owner, targets) {
    if (!this.cache.hasOwnProperty(owner)) {
        return targets;
    }

    var missing = {};
    var oCache = this.cache[owner];

    if (targets.allVMs && !this.oCache.allVMs) {
        missing.allVMs = true;
    }

    for (var t in targets.tags) {
        var notFound = false;
        var val = targets.tags[t];

        if (!oCache.tags.hasOwnProperty(t)) {
            notFound = true;
        } else {
            if (val === true && !oCache.tags[t].all) {
                notFound = true;
            } else {
                if (!oCache.tags[t].values.hasOwnProperty(val)) {
                    notFound = true;
                }
            }
        }

        if (notFound) {
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

    for (var v in targets.vms) {
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
