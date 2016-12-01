/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * tests for the VM cache
 */

'use strict';

var mod_cache = require('../lib/cache');
var mod_uuid = require('uuid');
var VMCache = require('../../lib/cache').VMCache;



// --- Tests



exports['missing'] = {
    'multiple tag values': function (t) {
        var cache = new VMCache();
        var expCache = {};
        var owner = mod_uuid.v4();
        var multiTargets = {
            tags: {
                multi_62789: [ '1', '2' ]
            }
        };
        var vm = mod_uuid.v4();

        // Empty cache - missing should just return what was passed in
        t.deepEqual(cache.missing(owner, multiTargets), multiTargets,
            'no owner in cache: missing all targets');

        // Add a VM to a cache to initialize it
        cache.addResolveData({ owner_uuid: owner, vms: [ vm ] });
        mod_cache.addVM(expCache, owner, vm);
        t.deepEqual(cache.cache, expCache, 'cache has VM in it');

        // Now try missing again - it should still return what was
        // passed in
        t.deepEqual(cache.missing(owner, multiTargets), multiTargets,
            'owner in cache: missing all targets');

        var keyTargets = {
            tags: {
                multi_62789: true
            }
        };

        t.deepEqual(cache.missing(owner, keyTargets), keyTargets,
            'missing all tag');

        cache.addResolveData({
            owner_uuid: owner,
            tags: { multi_62789: '2' }
        });

        mod_cache.addTag(expCache, owner, 'multi_62789', '2');
        t.deepEqual(cache.cache, expCache, 'cache has tag added');

        t.deepEqual(cache.missing(owner, multiTargets), {
            tags: {
                multi_62789: [ '1' ]
            }
        }, 'missing "1" value');

        // This still returns what we've passed in because we only have
        // some of the tag values, not all of them.
        t.deepEqual(cache.missing(owner, keyTargets), keyTargets,
            'missing all tag targets');


        // Add all multi_62789 tags to the cache
        cache.addResolveData({
            owner_uuid: owner,
            tags: { multi_62789: true }
        });

        mod_cache.addTag(expCache, owner, 'multi_62789');
        t.deepEqual(cache.cache, expCache, 'cache has all tags added');


        // Now both sets of targets should have nothing missing, because we
        // have all tag values in the cache
        t.deepEqual(cache.missing(owner, multiTargets), {},
            'owner in cache: missing all targets with only tag key');
        t.deepEqual(cache.missing(owner, keyTargets), {},
            'owner in cache: missing all targets with only tag key');

        return t.done();
    }
};
