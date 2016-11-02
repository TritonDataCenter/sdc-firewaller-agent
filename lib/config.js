/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * SDC config functions
 */

var execFile = require('child_process').execFile;
var VError = require('verror').VError;



// --- Exports


function findSysinfoAdminIP(si) {
    var iface;
    var ifaces = si['Network Interfaces'];

    for (var i in ifaces) {
        iface = ifaces[i];

        if (iface['NIC Names'] && iface['NIC Names'].indexOf('admin') !== -1) {
            return iface.ip4addr;
        }
    }
}


function getSysinfoValue(name, callback) {
    sysinfo(function (err, conf) {
        if (err) {
            return callback(err);
        }

        if (!conf.hasOwnProperty(name)) {
            return callback(new VError(
                'Could not find property "%s" in sysinfo', name));
        }

        return callback(null, conf[name]);
    });
}


function config(callback) {
    execFile('/bin/bash', [ '/lib/sdc/config.sh', '-json' ],
        function (err, stdout, stderr) {
        if (err) {
            err.stdout = stdout;
            err.stderr = stderr;
            return callback(err);
        }

        try {
            return callback(null, JSON.parse(stdout.toString()));
        } catch (err2) {
            return callback(err2);
        }
    });
}


function sysinfo(callback) {
    execFile('/usr/bin/sysinfo', [ ], function (err, stdout, stderr) {
        if (err) {
            err.stdout = stdout;
            err.stderr = stderr;
            return callback(err);
        }

        try {
            return callback(null, JSON.parse(stdout.toString()));
        } catch (err2) {
            return callback(err2);
        }
    });
}


module.exports = {
    findSysinfoAdminIP: findSysinfoAdminIP,
    getSysinfoValue: getSysinfoValue,
    sdc: config,
    sysinfo: sysinfo
};
