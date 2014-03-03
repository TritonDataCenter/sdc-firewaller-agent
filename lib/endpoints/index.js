/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Restify endpoints
 */



/*
 * Endpoints are in their own individual files, in a directory structure
 * that roughly matches their routes, eg: /rules -> rules.js
 */
var toRegister = {
    '/rules': require('./rules'),
    '/status': require('./status')
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
