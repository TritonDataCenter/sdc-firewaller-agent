/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * bunyan logger for tests: it's better than bad, it's good!
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
