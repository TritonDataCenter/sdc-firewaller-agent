/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Remote VM helpers
 */

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
