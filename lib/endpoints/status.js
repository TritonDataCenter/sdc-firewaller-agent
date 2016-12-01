/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Status endpoint
 */

'use strict';



/**
 * GET /status
 */
function getStatus(req, res, next) {
    var stat = {
        queued: req.app.queue.queued.length,
        recent: req.app.recentTasks
    };

    res.send(200, stat);
    return next();
}


/**
 * Register all endpoints with the restify server
 */
function register(http, before) {
    http.get(
        { path: '/status', name: 'getStatus' }, before, getStatus);
}



module.exports = {
    register: register
};
