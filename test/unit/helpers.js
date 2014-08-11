/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * unit test helpers
 */


var assert = require('assert-plus');
var bunyan = require('bunyan');
var clone = require('clone');
var createRemoteVM =
    require('../../node_modules/fw/lib/util/vm').createRemoteVM;
var firewaller;
var fwMocks = require('../../node_modules/fw/test/lib/mocks');
var fwHelpers = require('../../node_modules/fw/test/lib/helpers');
var extend = require('xtend');
var fs = require('fs');
var jsprim = require('jsprim');
var mockery = require('mockery');
var mocks = require('./mocks');
var mod_uuid = require('node-uuid');
var once = require('once');
var path = require('path');
var pred = require('../../lib/pred');
var stream = require('fast-stream');
var util = require('util');
var uuidSort = mocks._uuidSort;



// --- Globals



var AGENT;
var CUR_IP = 1;
var ID = 1;
var INITIAL_DATA;
var LOCAL_SERVER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
var STREAM;
var OWNER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
var OTHER_SERVER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';



// --- Internal helpers



/**
 * Returns the initial mock data
 */
function initialMockData() {
    if (!INITIAL_DATA) {
        // mock out package.json so the agent doesn't die trying to figure
        // out its version
        var pkgJson = path.normalize(__dirname + '/../../package.json');
        INITIAL_DATA = {
            fs: {}
        };
        INITIAL_DATA.fs[pkgJson] = JSON.stringify({ version: 'unit-test' });
    }

    return clone(INITIAL_DATA);
}


/**
 * Read a directory full of files, returning the JSON.parse()'d version of any
 * ending in .json.
 */
function readJSONdir(dir) {
    var fsData = fwMocks.values.fs;
    var objs = [];

    // console.log('fs: ' + JSON.stringify(fsData, null, 2));
    if (!fsData.hasOwnProperty(dir)) {
        return objs;
    }

    for (var f in fsData[dir]) {
        if (!jsprim.endsWith(f, '.json')) {
            continue;
        }

        objs.push(JSON.parse(fsData[dir][f]));
    }

    return objs.sort(uuidSort);
}


/**
 * Reset all mock data with empty values
 */
function resetMockData() {
    mocks._setMockData();
    fwMocks.reset({ initialValues: initialMockData() });

    // Add the vmadm mock function - it gets blown away by fwMocks.reset()
    var cpMock = fwMocks.values.child_process;
    cpMock['/usr/sbin/vmadm'] = mocks._execFileVmadm;
    fwMocks.mocks.fs.createWriteStream = mocks._createWriteStream;
}


/**
 * Initialize all mocks
 */
function setupMocks() {
    var localMocks = {};
    for (var m in mocks) {
        if (m.indexOf('_') !== 0) {
            localMocks[m] = mocks[m];
        }
    }

    var allowed = [
        './add-rule',
        './cache',
        './del-rule',
        './endpoints',
        './fw',
        './ping',
        './pred',
        './rules',
        './rvms',
        './status',
        './sync',
        './tasks',
        './update-rule',
        './vm',
        './vmapi',
        './vms',
        './vm-add',
        './vm-delete',
        './vm-update',
        '../fw',
        '../fwapi',
        '../vm',
        '../vmapi',
        '../../lib/agent',
        'async',
        'backoff',
        'fast-stream',
        'fw',
        'fw/lib/util/log',
        'jsprim',
        'json-schema',
        'os',
        'path'
    ];

    fwMocks.setup({
        allowed: allowed,
        initialValues: initialMockData(),
        mocks: localMocks
    });

    // Add the vmadm mock function
    var cpMock = fwMocks.values.child_process;
    cpMock['/usr/sbin/vmadm'] = mocks._execFileVmadm;
    fwMocks.mocks.fs.createWriteStream = mocks._createWriteStream;
}



// --- Exports



/**
 * Convert a vmadm-style VM (or list of VMs) to a fwadm remote VM
 */
function convertVMtoRVM(inVMs) {
    var vms = util.isArray(inVMs) ? inVMs : [ inVMs ];
    var rvms = [];

    for (var v in vms) {
        rvms.push(createRemoteVM(vms[v]));
    }

    return util.isArray(inVMs) ? rvms : rvms[0];
}


/**
 * Create both the firewall agent and a fake FWAPI for it to connect to. If
 * connect is true, connect the agent to the fake FWAPI.
 */
function createAgent(t, connect, callback) {
    if (!callback) {
        callback = connect;
        connect = false;
    }

    var conf = JSON.parse(fs.readFileSync(path.normalize(
        __dirname + '/../../config.json'), 'utf-8'));

    conf.serverUUID = LOCAL_SERVER;
    conf.imageVersion = '20140201T183410Z';
    conf.fwapi.host = 'localhost';
    conf.vmapi = {
        host: 'localhost'
    };

    conf.log = bunyan.createLogger({
        name: 'firewaller',
        level: process.env.LOG_LEVEL || 'fatal'
    });

    if (!firewaller) {
        setupMocks();
        firewaller = require('../../lib/agent');
    }

    STREAM = stream.createServer({
        log: conf.log,
        server_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    });

    STREAM.listen(conf.fwapi.fast.port, function (err) {
        t.ifError(err);

        AGENT = firewaller.create(conf);
        t.ok(AGENT, 'created agent');
        if (!connect) {
            return callback(AGENT);
        }

        AGENT.connect(function (err2) {
            if (err2) {
                t.ifError(err2);
                return callback(err2, null);
            }

            t.ok(!err2, 'agent connected');

            return callback(null, AGENT);
        });
    });
}


/**
 * t.deepEqual, but sort the lists by their uuid properties first.
 */
function equalSorted(t, actual, expected, desc) {
    t.deepEqual(clone(actual).sort(uuidSort), clone(expected).sort(uuidSort),
        desc);
}


/**
 * Create a basic rule object similar to what FWAPI would generate, overriding
 * fields as necessary.
 */
function generateRule(override) {
    var rule = extend({
        enabled: true,
        uuid: mod_uuid.v4(),
        version: '1'
    }, override);

    assert.ok(rule.rule, 'rule has rule property');
    assert.ok(rule.owner_uuid || rule.global,
        'rule has owner_uuid or global property');
    return rule;
}


/**
 * Generate a vmadm-like rule (that has all of the fields we care about,
 * omitting everything else).
 */
function generateVM(override) {
    if (!override) {
        override = {};
    }

    if (override.local) {
        override.server_uuid = LOCAL_SERVER;
    }

    // Defaults for these tests:

    if (!override.owner_uuid) {
        override.owner_uuid = OWNER_UUID;
    }

    if (!override.server_uuid) {
        override.server_uuid = OTHER_SERVER;
    }

    var vm = fwHelpers.generateVM(override);
    mocks._addVM(vm);
    return vm;
}


/**
 * Returns the last request made to VMAPI
 */
function lastVmapiReq() {
    var reqs = mocks._vmapiReqs();
    if (!reqs || reqs.length === 0) {
        return {};
    }

    return reqs[reqs.length - 1];
}


/**
 * Returns an array of the rules on the local CN
 */
function localRules() {
    return readJSONdir('/var/fw/rules');
}


/**
 * Returns an array of the remote VMs on the local CN
 */
function localRVMs() {
    return readJSONdir('/var/fw/vms');
}


/**
 * Generate a VMAPI query string based on the array elements
 */
function vmapiQuery(opts) {
    return '';
}


/**
 * Generate a VMAPI query string based on the array elements
 */
function vmapiReq(opts) {
    assert.object(opts, 'opts');

    var filt = pred.filt.allVMs({
        owner_uuid: opts.owner_uuid,
        serverUUID: opts.server_uuid || LOCAL_SERVER
    });
    var orFilter = [];

    (opts.vms || []).forEach(function (vm) {
        orFilter.push(pred.filt.eq('uuid', vm));
    });

    (opts.tags || []).forEach(function (tag) {
        orFilter.push(pred.filt.eq('tag.' + tag[0], tag[1]));
    });

    if (orFilter.length !== 0) {
        if (orFilter.length === 1) {
            filt.and.push(orFilter[0]);
        } else {
            filt.and.push({ or: orFilter});
        }
    }

    return {
        path: '/vms',
        query: {
            predicate: filt
        },
        headers: {
            // We increment our fake request ID by 1 every time,
            // so this is the last req_id:
            'x-request-id': (ID - 1).toString()
        }
    };
}


/**
 * Send a message to the firewaller agent.  Calls callback once the message
 * has been processed (or the timeout of 2 seconds has been reached).
 */
function sendMessage(name, value, callback) {
    var id = ID++;
    var toSend = {
        id: id,
        name: name,
        req_id: id.toString(),
        value: value
    };

    var timeout;
    var done = once(function _afterMsg(msg) {
        if (timeout) {
            clearTimeout(timeout);
        }

        return callback(msg);
    });

    AGENT.once('task-complete', done);
    STREAM.send(toSend);
    setTimeout(done, 2000);
}


/**
 * Close the agent and the fake FWAPI server
 */
function teardown(t) {
    if (AGENT) {
        AGENT.close();
    }

    if (STREAM) {
        STREAM.close();
    }

    return t.done();
}



module.exports = {
    createAgent: createAgent,
    equalSorted: equalSorted,
    fwapiReqs: mocks._fwapiReqs,
    lastVmapiReq: lastVmapiReq,
    localRules: localRules,
    localRVMs: localRVMs,
    OWNER_UUID: OWNER_UUID,
    reset: resetMockData,
    rule: generateRule,
    send: sendMessage,
    set: mocks._setMockData,
    teardown: teardown,
    uuidSort: uuidSort,
    vm: generateVM,
    vmapiQuery: vmapiQuery,
    vmapiReq: vmapiReq,
    vmapiReqs: mocks._vmapiReqs,
    vmToRVM: convertVMtoRVM
};
