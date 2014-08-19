/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * Mock objects for firewaller unit tests
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var clone = require('clone');
var createRemoteVM =
    require('../../node_modules/fw/lib/util/vm').createRemoteVM;
var fwMocks = require('../../node_modules/fw/test/lib/mocks');
var ldapjs = require('ldapjs');
var mod_log = require('../lib/log');
var pred = require('../../deps/vmapi/lib/common/predicate');
var util = require('util');



// --- Globals



var FWAPI_REQS = {};
var FWAPI_RULES = {};
var LOCAL_SERVER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
var LOG = mod_log.child({ component: 'mock' });
var FW_LOG = LOG.child({ component: 'fw' });
var VM_LOG = LOG.child({ component: 'vmadm' });
var VMAPI_REQS = [];
var VMS = {};
var RESOLVE = [];



// --- Internal helpers



function uuidSort(a, b) {
    if (a.uuid > b.uuid) {
        return 1;
    }

    if (a.uuid < b.uuid) {
        return -1;
    }

    return 0;
}


function values(obj, sort) {
    var ret = Object.keys(obj).map(function (k) {
        return clone(obj[k]);
    });

    if (sort) {
        return ret.sort(uuidSort);
    }

    return ret;
}



// --- child_process



function execFileVmadm(cmd, args, callback) {
    assert.equal(cmd, '/usr/sbin/vmadm');
    assert.arrayOfString(args, 'args');
    assert.equal(args[0], 'lookup');

    var vms = localVMs();
    VM_LOG.debug({ vms: vms }, 'vmadm: returning vms');
    return callback(null, JSON.stringify(vms), null);
}



// --- fs



function createWriteStream() {
    return process.stderr;
}



// --- restify



function mockRestify() {
    this.url = 'http://localhost:8080';
}


mockRestify.prototype.close = function _close() {
    return;
};


mockRestify.prototype.get = function _get() {
    return;
};


mockRestify.prototype.listen = function _listen(_, callback) {
    return callback();
};



function createRestifyServer() {
    return new mockRestify();
}



// --- sdc-clients.FWAPI



function mockFWAPI(opts) {
    assert.object(opts, 'opts');
    this.log = LOG.child({ component: 'fwapi' });
    this.client = {
        close: function () { return true; }
    };
}


mockFWAPI.prototype._addReq = function addReq(route, params, callback) {
    if (!FWAPI_REQS.hasOwnProperty(route)) {
        FWAPI_REQS[route] = [];
    }

    FWAPI_REQS[route].push(params);
};


mockFWAPI.prototype.createRule = function createRule(params, callback) {
    if (!params.hasOwnProperty('uuid')) {
        return callback(new Error('uuid is required!'));
    }

    var rule = clone(params);
    rule.created_by = 'fwapi';
    FWAPI_RULES[rule.uuid] = rule;

    this._addReq('createRule', params);
    this.log.debug({ params: params, rule: rule }, 'FWAPI.createRule');
    return callback(null, rule);
};


mockFWAPI.prototype.post = function post(endpoint, params, callback) {
    assert.equal(endpoint, '/resolve');
    assert.object(params, 'params');
    assert.string(params.owner_uuid, 'params.owner_uuid');

    var resolved = RESOLVE.shift();
    assert.object(resolved, 'RESOLVE must not be empty');
    assert.string(resolved.owner_uuid, 'resolved.owner_uuid');
    assert.ok(util.isArray(resolved.rules), 'resolved.rules (array)');
    assert.object(resolved.tags, 'resolved.tags');
    assert.ok(util.isArray(resolved.vms), 'resolved.vms (array)');

    this._addReq('resolve', params);
    this.log.debug({ params: params, resolved: resolved }, 'FWAPI.post');
    return callback(null, resolved);
};



// --- sdc-clients.VMAPI



function mockVMAPI(opts) {
    assert.object(opts, 'opts');
    this.log = LOG.child({ component: 'vmapi' });
    this.client = {
        close: function () { return true; }
    };
}


mockVMAPI.prototype.get = function vmsGet(params, callback) {
    assert.object(params, 'params');
    assert.string(params.path, 'params.path');
    assert.object(params.query, 'params.query');
    assert.string(params.query.predicate, 'params.query.predicate');
    assert.object(params.headers, 'params.headers');
    assert.string(params.headers['x-request-id'],
        'params.headers.x-request-id');

    var parsedPred = JSON.parse(params.query.predicate);
    var ldapQuery = pred.toLdapQuery(parsedPred);
    var filter = ldapjs.parseFilter(ldapQuery);

    LOG.debug({ pred: parsedPred, query: ldapQuery }, 'listVMs: query');

    // Don't record the stringified predicate, to make diff'ing easier
    var clonedParams = clone(params);
    clonedParams.query.predicate = parsedPred;
    VMAPI_REQS.push(clonedParams);

    var vms = [];
    for (var v in VMS) {
        var vm = clone(VMS[v]);
        // VMAPI has a funny syntax for storing tags:
        // (tags=*-<tag key>=<tag value>-*). pred.toLdapQuery assumes this
        // format, so create a new VM object that has all of the tags squashed
        // into that format.
        if (vm.hasOwnProperty('tags')) {
            var tags = [];

            for (var t in vm.tags) {
                tags.push('-' + t + '=' + vm.tags[t] + '-');
            }

            vm.tags = tags.join(',');
        }

        if (filter.matches(vm)) {
            vms.push(clone(VMS[v]));
        }
    }

    this.log.debug({ params: params, vms: vms }, 'VMAPI.listVMs');
    return callback(null, vms);
};



// --- mock data



function addVM(vm) {
    VMS[vm.uuid] = clone(vm);
    VM_LOG.debug({ vm: vm }, 'addVM');
}


/**
 * Get requests made to the mock FWAPI: an object mapping the restify route
 * to an array of the request parameters for each request
 */
function getFWAPIrequests() {
    return clone(FWAPI_REQS);
}


/**
 * Get the list of requests made to the mock VMAPI
 */
function getVMAPIrequests() {
    return clone(VMAPI_REQS);
}


/**
 * Get the list of VMs on the local server
 */
function localVMs() {
    return clone(values(VMS).filter(function (vm) {
        return (vm.hasOwnProperty('server_uuid') &&
            vm.server_uuid == LOCAL_SERVER);
    }));
}


/**
 * Set data for various mocks:
 * - fwapiRules {Object keyed by UUID} : rules in FWAPI
 * - vms {Object keyed by UUID} : VMs to be returned by VMAPI and vmadm
 *   (if the VM's server_uuid is set to LOCAL_SERVER)
 * - resolved {Array of Objects} : responsed to be returned by posting to
 *   the mock FWAPI's /resolve endpoint
 */
function setMockData(data) {
    var fsData = fwMocks.values.fs;

    FWAPI_RULES = {};
    RESOLVE = [];
    VMS = {};

    if (!data) {
        data = {};
    }

    LOG.debug(data, 'setMockData');
    if (data.fwapiRules) {
        data.fwapiRules.forEach(function (r) {
            FWAPI_RULES[r.uuid] = clone(r);
        });
    }

    if (data.localRules) {
        var fwDir = '/var/fw/rules';
        if (!fsData.hasOwnProperty(fwDir)) {
            fsData[fwDir] = {};
        }

        data.localRules.forEach(function (r) {
            assert.object(r, 'rule');
            assert.string(r.uuid, 'rule.uuid');
            fsData[fwDir][r.uuid + '.json'] = JSON.stringify(r, null, 2);
        });
    }

    if (data.localRVMs) {
        var rvmDir = '/var/fw/vms';
        if (!fsData.hasOwnProperty(rvmDir)) {
            fsData[rvmDir] = {};
        }

        data.localRVMs.forEach(function (v) {
            assert.object(v, 'rvm');
            assert.string(v.uuid, 'rvm.uuid');
            fsData[rvmDir][v.uuid + '.json'] = JSON.stringify(
                createRemoteVM(v), null, 2);
        });
    }

    if (data.vms) {
        data.vms.forEach(function (v) {
            VMS[v.uuid] = clone(v);
        });
    }

    // XXX: it would be great if this could somehow use the resolve logic
    // from FWAPI, rather than just hard-coding this
    if (data.resolve) {
        RESOLVE = clone(data.resolve);
    }
}


module.exports = {
    // -- mocks

    // Pass through everything but createLogger: this is so that we
    // can control fw.js logging using the LOG_DEBUG variable (as per
    // the loggers at the top of this file).
    bunyan: {
        createLogger: function createLogger() {
            // Prevent createLogger() in fw.js from adding a file stream
            // to our logger:
            FW_LOG.child = function (args) {
                return FW_LOG;
            };

            return FW_LOG;
        },
        stdSerializers: bunyan.stdSerializers,
        resolveLevel: bunyan.resolveLevel,
        RingBuffer: bunyan.RingBuffer
    },

    restify: {
        createServer: createRestifyServer
    },

    'sdc-clients': {
        FWAPI: mockFWAPI,
        VMAPI: mockVMAPI
    },

    // -- mock data getters / setters,  other non-mock stuff
    _addVM: addVM,
    _fwapiReqs: getFWAPIrequests,
    get _fwapiRules() {
        return FWAPI_RULES;
    },
    _localVMs: localVMs,
    _uuidSort: uuidSort,
    _setMockData: setMockData,
    _vmapiReqs: getVMAPIrequests,

    // mocks that add to those in fwMocks, so we don't register them
    // directly
    _execFileVmadm: execFileVmadm,
    _createWriteStream: createWriteStream
};
