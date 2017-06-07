/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Restify endpoints
 */

'use strict';

/*
 * Endpoints are in their own individual files, in a directory structure
 * that roughly matches their routes, eg: /rules -> rules.js
 */
var toRegister = {
    '/rules': require('./rules'),
    '/rvms': require('./rvms'),
    '/status': require('./status'),
    '/vms': require('./vms')
};



// --- Exports



/*
 * Register all endpoints with the restify server
 */
function register(http, log, before) {
    for (var t in toRegister) {
        log.debug('Registering endpoints for "%s"', t);
        toRegister[t].register(http, before);
    }
}



module.exports = {
    register: register
};
