/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Ping task
 */


function ping(opts, callback) {
    opts.log.debug(opts.value, 'Ping received');
    return callback();
}


module.exports = {
    run: ping
};
