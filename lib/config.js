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



function bootparams(callback) {
    execFile('/usr/bin/bootparams', [], function (error, stdout, stderr) {
        if (error) {
            return callback(error);
        }

        var conf = {};
        stdout.toString().split('\n').forEach(function (line) {
            var idx = line.indexOf('=');
            var k = line.substr(0, idx);
            var v = line.substr(idx+1);
            if (k) {
                conf[k] = v;
            }
        });

        return callback(null, conf);
    });
}


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


function getValue(name, callback) {
    config(function (err, conf) {
        if (err) {
            return callback(err);
        }

        if (!conf.hasOwnProperty(name)) {
            return callback(new VError(
                'Could not find property "%s" in config file', name));
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
    bootparams: bootparams,
    findSysinfoAdminIP: findSysinfoAdminIP,
    getSysinfoValue: getSysinfoValue,
    getValue: getValue,
    sdc: config,
    sysinfo: sysinfo
};
