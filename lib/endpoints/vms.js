/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Endpoints for inspecting VM firewall information
 */

var fw = require('../fw');


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
