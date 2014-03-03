/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Status endpoint
 */



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
