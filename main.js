/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Firewaller agent
 */

'use strict';

var assert = require('assert-plus');
var bunyan = require('bunyan');
var config = require('./lib/config');
var cueball = require('cueball');
var firewaller = require('./lib/agent');
var fs = require('fs');
var netconfig = require('triton-netconfig');
var path = require('path');
var VError = require('verror').VError;



// --- Main entry point



var CONFIG;
var LOG = bunyan.createLogger({
    name: 'firewaller',
    level: 'debug'
});

try {
    CONFIG = JSON.parse(fs.readFileSync(
        path.normalize(__dirname + '/config.json'), 'utf-8'));
    assert.object(CONFIG.fwapi, 'CONFIG.fwapi');
    // Let the FwAgent constructor handle the rest of the validation
} catch (parseErr) {
    LOG.error(parseErr, 'Error parsing config file');
    process.exit(1);
}


config.sdc(function (err, sdcConfig) {
    if (err) {
        LOG.error(err, 'Error getting SDC config');
        return;
    }

    ['fwapi_domain', 'vmapi_domain'].forEach(function (key) {
        if (!sdcConfig.hasOwnProperty(key)) {
            throw new VError(
                'Could not find property "%s" in config file', key);
        }
    });

    config.sysinfo(function (err2, sysinfo) {
        if (err2) {
            LOG.error(err2, 'Error getting sysinfo');
            return;
        }

        var image = sysinfo['Live Image'];
        var uuid = sysinfo.UUID;

        CONFIG.log = LOG;
        CONFIG.serverUUID = uuid;
        CONFIG.imageVersion = image;
        CONFIG.fwapi.host = sdcConfig.fwapi_domain;
        CONFIG.vmapi = { host: sdcConfig.vmapi_domain };
        CONFIG.listenIP = netconfig.adminIpFromSysinfo(sysinfo);

        // JSSTYLED
        var binder = CONFIG.vmapi.host.replace(/^vmapi/, 'binder');

        CONFIG.cueballAgent = new cueball.HttpAgent({
            resolvers: [ binder ],
            initialDomains: [
                CONFIG.fwapi.host,
                CONFIG.vmapi.host
            ],
            tcpKeepAliveInitialDelay: 10000,
            ping: '/ping',
            pingInterval: 90000,
            spares: 3,
            maximum: 10,
            recovery: {
                default: {
                    timeout: 2000,
                    maxTimeout: 8000,
                    retries: 3,
                    delay: 0,
                    maxDelay: 1000
                }
            }
        });

        if (!CONFIG.listenIP) {
            LOG.error({ sysinfo: sysinfo }, 'Error finding sysinfo admin IP');
            return;
        }

        var agent;
        try {
            agent = firewaller.create(CONFIG);
        } catch (createErr) {
            LOG.error(createErr, 'Error creating agent');
            return;
        }

        agent.sync(function (err3) {
            if (err3) {
                LOG.error(err3, 'Error doing initial startup sync. ' +
                    'Continuing...');
            }

            agent.connect(function (err4) {
                if (err4) {
                    LOG.error(err4, 'Error connecting to %s',
                        sdcConfig.fwapi_domain);
                    return;
                }

                LOG.info('Connected to %s', sdcConfig.fwapi_domain);
            });
        });
    });
});
