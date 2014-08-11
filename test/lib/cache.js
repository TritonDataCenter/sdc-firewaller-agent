/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * cache helpers
 */



// --- Internal



/**
 * Creates an empty cache object for the given owner
 */
function createEmptyCache(cache, owner) {
    if (!cache.hasOwnProperty(owner)) {
        cache[owner] = {
            allVMs: false,
            tags: {},
            vms: {}
        };
    }

    return cache[owner];
}



// --- Exports



/**
 * Add a tag with optional value to a cache object
 */
function addTag(cache, owner, tag, val) {
    var oCache = createEmptyCache(cache, owner);

    if (!oCache.tags.hasOwnProperty(tag)) {
        oCache.tags[tag] = {};
    }

    if (!oCache.tags[tag].hasOwnProperty('values')) {
        oCache.tags[tag].values = {};
    }

    if (val) {
        oCache.tags[tag].values[val] = 1;

    } else {
        oCache.tags[tag].all = true;
        oCache.tags[tag].values = {};
    }
}


/**
 * Add a VM to a cache object
 */
function addVM(cache, owner, vm) {
    var oCache = createEmptyCache(cache, owner);

    oCache.vms[vm] = 1;
}



module.exports = {
    addTag: addTag,
    addVM: addVM
};
