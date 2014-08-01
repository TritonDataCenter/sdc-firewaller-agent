/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Endpoints for inspecting VM firewall information
 */

var fw = require('../fw');
var restify = require('restify');



/**
 * GET /vms/:uuid/status
 */
function getVMstatus(req, res, next) {
    var opts = {
        log: req.log,
        payload: {
            uuid: req.params.uuid
        }
    };

    fw.status(opts, function (err, stats) {
        if (err) {
            return next(err);
        }

        res.send(200, stats);
        return next();
    });
}


/**
 * Register all endpoints with the restify server
 */
function register(http, before) {
    http.get(
        { path: '/vms/:uuid/status', name: 'getVMstatus' }, before,
        getVMstatus);
}



module.exports = {
    register: register
};
