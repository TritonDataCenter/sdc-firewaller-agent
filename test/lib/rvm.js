/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Remote VM helpers
 */

'use strict';

var h = require('../unit/helpers');



/**
 * Confirms the local list of rules is equal to the given list
 */
function localEquals(t, exp, desc) {
    h.equalSorted(t, h.localRVMs(), exp.map(function (v) {
        return h.vmToRVM(v);
    }), desc);
}



module.exports = {
    localEquals: localEquals
};
