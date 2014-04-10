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
var stream = require('fast-stream');
var util = require('util');
var uuidSort = mocks._uuidSort;



// --- Globals



var AGENT;
var CUR_IP = 1;
var ID = 1;
var LOCAL_SERVER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
var STREAM;
var OWNER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
var OTHER_SERVER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';



// --- Internal helpers



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
 * Initialize all mocks
 */
function setupMocks() {
    var localMocks = {};
    for (var m in mocks) {
        if (m.indexOf('_') !== 0) {
            localMocks[m] = mocks[m];
        }
    }

    // mock out package.json so the agent doesn't die trying to figure
    // out its version
    var pkgJson = path.normalize(__dirname + '/../../package.json');
    var initData = {
        fs: {}
    };
    initData.fs[pkgJson] = JSON.stringify({ version: 'unit-test' });

    var allowed = [
        './add-rule',
        './cache',
        './del-rule',
        './endpoints',
        './fw',
        './ping',
        './rules',
        './status',
        './sync',
        './tasks',
        './update-rule',
        './vm',
        './vmapi',
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
        initialValues: initData,
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
function vmapiQueryStr(elements) {
    return '(&' + elements.join('') + ')';
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
        req_id: id,
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
    fmt: {
        owner_uuid: '(owner_uuid=%s)',
        tag: '(tags=*%s=%s*)',
        vm: '(uuid=%s)'
    },
    fwapiReqs: mocks._fwapiReqs,
    localRules: localRules,
    localRVMs: localRVMs,
    OWNER_UUID: OWNER_UUID,
    rule: generateRule,
    send: sendMessage,
    set: mocks._setMockData,
    str: {
        server: util.format('(!(server_uuid=%s))', LOCAL_SERVER),
        state: '(!(state=destroyed))(!(state=failed))(!(state=provisioning))'
    },
    teardown: teardown,
    uuidSort: uuidSort,
    vm: generateVM,
    vmapiQuery: vmapiQueryStr,
    vmapiReqs: mocks._vmapiReqs,
    vmToRVM: convertVMtoRVM
};
