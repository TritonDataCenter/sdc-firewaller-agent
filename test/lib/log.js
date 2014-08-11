/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * bunyan logger for tests
 */

var bunyan = require('bunyan');

module.exports = bunyan.createLogger({
    name: 'test',
    serializers: bunyan.stdSerializers,
    streams: [
        {
            level: process.env.LOG_LEVEL || 'info',
            stream: process.stderr
        }
    ]
});
