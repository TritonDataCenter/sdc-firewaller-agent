/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Endpoints for inspecting rules
 */

var fw = require('../fw');
var restify = require('restify');



/**
 * GET /rules/:uuid
 */
function getRule(req, res, next) {
    var opts = {
        log: req.log,
        payload: {
            uuid: req.params.uuid
        }
    };

    fw.get(opts, function (err, rule) {
        if (err) {
            if (err.code == 'ENOENT') {
                return next(new restify.ResourceNotFoundError(
                    'rule not found'));
            }

            return next(err);
        }

        res.send(200, rule);
        return next();
    });
}


/**
 * Register all endpoints with the restify server
 */
function register(http, before) {
    http.get(
        { path: '/rules/:uuid', name: 'getRule' }, before, getRule);
}



module.exports = {
    register: register
};
