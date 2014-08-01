/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Endpoints for inspecting remote VMs
 */

var fw = require('../fw');
var restify = require('restify');



/**
 * GET /rvms/:uuid
 */
function getRVM(req, res, next) {
    var opts = {
        log: req.log,
        payload: {
            remoteVM: req.params.uuid
        }
    };

    fw.getRVM(opts, function (err, rvm) {
        if (err) {
            if (err.code == 'ENOENT') {
                return next(new restify.ResourceNotFoundError(
                    'remote VM not found'));
            }

            return next(err);
        }

        res.send(200, rvm);
        return next();
    });
}


/**
 * Register all endpoints with the restify server
 */
function register(http, before) {
    http.get(
        { path: '/rvms/:uuid', name: 'getRVM' }, before, getRVM);
}



module.exports = {
    register: register
};
