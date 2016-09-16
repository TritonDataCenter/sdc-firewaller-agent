/*
 * CDDL HEADER START
 *
 * The contents of this file are subject to the terms of the
 * Common Development and Distribution License, Version 1.0 only
 * (the "License").  You may not use this file except in compliance
 * with the License.
 *
 * You can obtain a copy of the license at http://smartos.org/CDDL
 *
 * See the License for the specific language governing permissions
 * and limitations under the License.
 *
 * When distributing Covered Code, include this CDDL HEADER in each
 * file.
 *
 * If applicable, add the following below this CDDL HEADER, with the
 * fields enclosed by brackets "[]" replaced with your own identifying
 * information: Portions Copyright [yyyy] [name of copyright owner]
 *
 * CDDL HEADER END
 *
 * Copyright 2016, Joyent, Inc. All rights reserved.
 *
 *
 * fwadm: CLI logic
 */

var assert = require('assert-plus');
var cli = require('./cli');
var clone = require('clone');
var cmdln = require('cmdln');
var fw = require('./fw');
var onlyif = require('onlyif');
var path = require('path');
var pipeline = require('./pipeline').pipeline;
var util = require('util');
var util_log = require('./util/log');
var util_obj = require('./util/obj');
var vasync = require('vasync');
var verror = require('verror');
var VM = require('/usr/vm/node_modules/VM');



// --- Globals



var LOG;
var OPTS = {
    dryrun: {
        names: ['dryrun'],
        type: 'bool',
        help: 'Do not apply changes.'
    },
    delim: {
        names: ['delim', 'd'],
        type: 'string',
        helpArg: '<char>',
        help: 'Output delimiter.'
    },
    description: {
        names: ['description', 'desc' ],
        type: 'string',
        helpArg: '<str>',
        help: 'Rule description.'
    },
    enable: {
        names: ['enable', 'e'],
        type: 'bool',
        help: 'Enable the rule'
    },
    file: {
        names: ['file', 'f'],
        type: 'string',
        helpArg: '<file>',
        help: 'Input file.'
    },
    global: {
        names: ['global', 'g'],
        type: 'bool',
        help: 'Global rule.'
    },
    help: {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Print help and exit.'
    },
    json: {
        names: ['json', 'j'],
        type: 'bool',
        help: 'Output JSON.'
    },
    output_fields: {
        names: ['fields', 'o'],
        type: 'string',
        helpArg: '<fields>',
        help: 'Output field list'
    },
    owner_uuid: {
        names: ['owner_uuid', 'O'],
        type: 'string',
        helpArg: '<uuid>',
        help: 'Owner UUID'
    },
    parseable: {
        names: ['parseable', 'p'],
        type: 'bool',
        help: 'Parseable output'
    },
    stdout: {
        names: ['stdout'],
        type: 'bool',
        help: 'Output file changes to stdout.'
    },
    verbose: {
        names: ['verbose', 'v'],
        type: 'bool',
        help: 'Verbose output.'
    }
};



// --- Utilities



/**
 * Translates the payload into the format expected by fw.js
 */
function preparePayload(opts, payload) {
    var newOpts = {};
    if (payload) {
        newOpts = clone(payload);

        // Allow doing this:
        //   echo '{ ... }' | fwadm add|update
        if (newOpts.hasOwnProperty('rule')
            || newOpts.hasOwnProperty('enabled')
            || newOpts.hasOwnProperty('description')
            || newOpts.hasOwnProperty('owner_uuid')
            || newOpts.hasOwnProperty('version')) {
            // Trying to add a single rule, and nothing else
            newOpts = { rules: [ newOpts ] };
        }
    }

    if (opts) {
        newOpts.dryrun = opts.dryrun || false;

        if (opts.enable) {
            newOpts.rules.forEach(function (r) {
                r.enabled = true;
            });
        }

        if (opts.global) {
            newOpts.rules.forEach(function (r) {
                r.global = true;
            });
        }

        if (opts.owner_uuid && newOpts.rules) {
            newOpts.rules.forEach(function (r) {
                r.owner_uuid = opts.owner_uuid;
            });
        }

        if (opts.stdout) {
            newOpts.filecontents = true;
        }
    }

    return newOpts;
}


/**
 * Displays the results of a command that adds or updates rules
 */
function ruleOutput(err, res, opts, action) {
    if (err) {
        return cli.outputError(err, opts);
    }

    if (opts && opts.json) {
        return console.log(cli.json(res));
    }

    if (opts && opts.stdout && res.hasOwnProperty('files')) {
        for (var f in res.files) {
            console.log('=== %s', f);
            console.log(res.files[f]);
            console.log('');
        }
    }

    var out = [];

    if (res.rules && res.rules.length !== 0) {
        out.push(util.format('%s rules:', action));
        res.rules.forEach(function (r) {
            out.push(cli.ruleLine(r));
        });
    }

    if (res.remoteVMs && res.remoteVMs.length !== 0) {
        out.push(util.format('%s remote VMs:', action));
        out = out.concat(res.remoteVMs);
    }

    if (opts && opts.verbose) {
        out.push('');
        out.push('VMs affected:');
        out = out.concat(res.vms);
    }
    console.log(out.join('\n'));
}


/**
 * Performs an update
 */
function doUpdate(opts, payload, action, callback) {
    try {
        assert.object(opts, 'opts');
        assert.object(payload, 'payload');
        assert.string(action, 'action');
    } catch (err) {
        cli.outputError(err);
        return callback(err);
    }

    LOG = util_log.create({ action: 'update' });

    pipeline({
    funcs: [
        function vms(_, cb) { VM.lookup({}, { fields: fw.VM_FIELDS }, cb); },
        function updateRules(state, cb) {
            payload.log = LOG;
            payload.vms = state.vms;
            return fw.update(payload, cb);
        }
    ]}, function _afterUpdate(err, res) {
        ruleOutput(err, res.state.updateRules, opts, action);
        return callback(err);
    });
}


/**
 * Starts or stops the firewall for a VM
 */
function startStop(opts, args, enabled, callback) {
    var uuid = cli.validateUUID(args[0]);

    VM.update(uuid, { firewall_enabled: enabled }, function _afterUpdate(err) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        if (opts && opts.json) {
            console.log(cli.json({ result: 'success' }));
        } else {
            console.log('Firewall %s for VM',
                enabled ? 'started' : 'stopped', uuid);
        }

        return callback();
    });
}



// --- Fwadm Cmdln object



/**
 * Constructor for a new fwadm cmdln object
 */
function Fwadm() {
    cmdln.Cmdln.call(this, {
        name: 'fwadm',
        desc: 'Manage firewall rules',
        helpSubcmds: [
            'add',
            'delete',
            'disable',
            'enable',
            'get',
            'list',
            'update',
            'vms',
            { group: '' },
            'add-rvm',
            'delete-rvm',
            'get-rvm',
            'list-rvms',
            'rvm-rules',
            { group: '' },
            'rules',
            'start',
            'status',
            'stats',
            'stop',
            { group: '', unmatched: true }
        ],
        options: [ OPTS.help, OPTS.json, OPTS.verbose ]
    });
}

util.inherits(Fwadm, cmdln.Cmdln);



// --- Command handlers



/**
 * Adds firewall data
 */
Fwadm.prototype.do_add = function (subcmd, opts, args, callback) {
    LOG = util_log.create({ action: 'add' });

    pipeline({
    funcs: [
        function payload(_, cb) { cli.getPayload(opts, args, cb); },
        function vms(_, cb) { VM.lookup({}, { fields: fw.VM_FIELDS }, cb); },
        function addRules(state, cb) {
            var addOpts = preparePayload(opts, state.payload);
            addOpts.vms = state.vms;
            addOpts.log = LOG;
            return fw.add(addOpts, cb);
        }
    ]}, function _afterAdd(err, results) {
        ruleOutput(err, results.state.addRules, opts, 'Added');
        return callback(err);
    });
};


/**
 * Adds a remote VM
 */
Fwadm.prototype.do_add_rvm = function (subcmd, opts, args, callback) {
    LOG = util_log.create({ action: 'add' });

    pipeline({
    funcs: [
        function payload(_, cb) { cli.getPayload(opts, args, cb); },
        function vms(_, cb) { VM.lookup({}, { fields: fw.VM_FIELDS }, cb); },
        function addRules(state, cb) {
            var addOpts = {
                log: LOG,
                vms: state.vms
            };

            if (state.payload.hasOwnProperty('remoteVMs')) {
                // formatted like it was being passed to 'fwadm add'
                addOpts.remoteVMs = state.payload.remoteVMs;
            } else {
                // just the remote VM (hopefully)
                addOpts.remoteVMs = [ state.payload ];
            }

            return fw.add(addOpts, cb);
        }
    ]}, function _afterAdd(err, results) {
        ruleOutput(err, results.state.addRules, opts, 'Added');
        return callback(err);
    });
};


/**
 * Lists firewall rules
 */
Fwadm.prototype.do_list = function (subcmd, opts, args, callback) {
    // XXX: support sorting
    var listOpts = {};
    if (opts.fields) {
        opts.fields = opts.fields.split(',');
        listOpts.fields = opts.fields;
    }

    if (opts.delim && !opts.parseable) {
        callback(new cmdln.UsageError('-d requires -p'));
        return;
    }

    if (opts.json && opts.parseable) {
        callback(new cmdln.UsageError('cannot specify both -j and -p'));
        return;
    }

    LOG = util_log.create({ action: 'list' }, true);
    listOpts.log = LOG;

    fw.list(listOpts, function (err, res) {
        cli.displayRules(err, res, opts);
        return callback(err);
    });
};


/**
 * Lists remote VMs
 */
Fwadm.prototype.do_list_rvms = function (subcmd, opts, args, callback) {
    LOG = util_log.create({ action: 'listRemoteVMs' }, true);

    // XXX: support filtering, sorting
    return fw.listRVMs({ log: LOG }, function (err, res) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        console.log(cli.json(res));
        return callback();
    });
};


/**
 * Updates a rule
 */
Fwadm.prototype.do_update = function (subcmd, opts, args, callback) {
    var id;
    if (args.length !== 0) {
        id = args.shift();
    }

    cli.getPayload(opts, args, function (err, payload) {
        if (err) {
            callback(err);
            return;
        }

        var updatePayload = preparePayload(opts, payload);

        // Allow doing an 'update <uuid>' instead of requiring the UUID be in
        // the payload:
        if (id && updatePayload.hasOwnProperty('rules')
            && updatePayload.rules.length === 1) {
            updatePayload.rules[0].uuid = cli.validateUUID(id);
        }

        doUpdate(opts, updatePayload, 'Updated', callback);
    });
};


/**
 * Gets a firewall rule
 */
Fwadm.prototype.do_get = function (subcmd, opts, args, callback) {
    var uuid = cli.validateUUID(args[0]);
    LOG = util_log.create({ action: 'get' }, true);

    return fw.get({ log: LOG, uuid: uuid }, function (err, rule) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        console.log(cli.json(rule));
        return callback();
    });
};


/**
 * Gets a remote VM
 */
Fwadm.prototype.do_get_rvm = function (subcmd, opts, args, callback) {
    var uuid = cli.validateUUID(args[0]);
    LOG = util_log.create({ action: 'getRemoteVM' }, true);

    return fw.getRVM({ log: LOG, remoteVM: uuid }, function (err, rvm) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        console.log(cli.json(rvm));
        return callback();
    });
};


/**
 * Enables or disables firewall rules
 */
function enableDisable(subcmd, opts, args, callback) {
    var enabled = subcmd === 'enable';
    if (args.length === 0) {
        callback(new cmdln.UsageError('Must specify rules to enable!'));
        return;
    }

    var rules = args.map(function (uuid) {
        return { uuid: cli.validateUUID(uuid), enabled: enabled };
    });

    doUpdate(opts, preparePayload(opts, { rules: rules }),
        enabled ? 'Enabled' : 'Disabled', callback);
}


Fwadm.prototype.do_enable = function () {
    enableDisable.apply(this, arguments);
};


Fwadm.prototype.do_disable = function () {
    enableDisable.apply(this, arguments);
};


/**
 * Deletes a firewall rule
 */
Fwadm.prototype.do_delete = function (subcmd, opts, args, callback) {
    if (args.length === 0) {
        return console.error('Must specify rules to delete!');
    }

    args.forEach(function (uuid) {
        cli.validateUUID(uuid);
    });

    LOG = util_log.create({ action: 'del' });

    pipeline({
    funcs: [
        function vms(_, cb) { VM.lookup({}, { fields: fw.VM_FIELDS }, cb); },
        function delRules(state, cb) {
            var delOpts = preparePayload(opts);
            delOpts.log = LOG;
            delOpts.vms = state.vms;
            delOpts.uuids = args;
            return fw.del(delOpts, cb);
        }
    ]}, function _afterDel(err, results) {
        ruleOutput(err, results.state.delRules, opts, 'Deleted');
        return callback(err);
    });
};


/**
 * Deletes a remote VM
 */
Fwadm.prototype.do_delete_rvm = function (subcmd, opts, args, callback) {
    if (args.length === 0) {
        return console.error('Must specify remote VMs to delete!');
    }

    args.forEach(function (uuid) {
        cli.validateUUID(uuid);
    });

    LOG = util_log.create({ action: 'del' });

    pipeline({
    funcs: [
        function vms(_, cb) { VM.lookup({}, { fields: fw.VM_FIELDS }, cb); },
        function delRVMs(state, cb) {
            var delOpts = preparePayload(opts);
            delOpts.log = LOG;
            delOpts.vms = state.vms;
            delOpts.rvmUUIDs = args;
            return fw.del(delOpts, cb);
        }
    ]}, function _afterDel(err, results) {
        ruleOutput(err, results.state.delRVMs, opts, 'Deleted');
        return callback(err);
    });
};


/**
 * Gets the rules that apply to a remote VM
 */
Fwadm.prototype.do_rvm_rules = function (subcmd, opts, args, callback) {
    var uuid = cli.validateUUID(args[0]);
    LOG = util_log.create({ action: 'rvmRules' }, true);

    return VM.lookup({}, { fields: fw.VM_FIELDS }, function (err, vms) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        return fw.rvmRules({ log: LOG, remoteVM: uuid, vms: vms },
            function (err2, res) {
            cli.displayRules(err2, res, opts);
            return callback(err2);
        });
    });
};


/**
 * Gets the rules that apply to a zone
 */
Fwadm.prototype.do_rules = function (subcmd, opts, args, callback) {
    var uuid = cli.validateUUID(args[0]);
    LOG = util_log.create({ action: 'vmRules' }, true);

    return VM.lookup({}, { fields: fw.VM_FIELDS }, function (err, vms) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        return fw.vmRules({ log: LOG, vm: uuid, vms: vms },
            function (err2, res) {
            cli.displayRules(err2, res, opts);
            return callback(err2);
        });
    });
};


/**
 * Starts the firewall for a VM
 */
Fwadm.prototype.do_start = function (subcmd, opts, args, callback) {
    return startStop(opts, args, true, callback);
};


/**
 * Stops the firewall for a VM
 */
Fwadm.prototype.do_stop = function (subcmd, opts, args, callback) {
    return startStop(opts, args, false, callback);
};


/**
 * Gets the status of a VM's firewall (and extra information from ipf if
 * the verbose flag is set)
 */
Fwadm.prototype.do_status = function (subcmd, opts, args, callback) {
    var uuid = cli.validateUUID(args[0]);
    LOG = util_log.create({ action: 'status' }, true);

    fw.status({ log: LOG, uuid: uuid }, function (err, res) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        if (opts && opts.json) {
            console.log(cli.json(res));
            return callback();
        }

        if (opts && opts.verbose) {
            for (var key in res) {
                console.log('%s: %s', key, res[key]);
            }
            return;
        }

        console.log(res.running ? 'running' : 'stopped');
        return callback();
    });
};


/**
 * Gets rule statistics for a VM's firewall
 */
Fwadm.prototype.do_stats = function (subcmd, opts, args, callback) {
    var uuid = cli.validateUUID(args[0]);
    LOG = util_log.create({ action: 'stats' }, true);

    fw.stats({ log: LOG, uuid: uuid }, function (err, res) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        if (opts && opts.json) {
            console.log(cli.json(res.rules));
            return callback();
        }

        res.rules.forEach(function (r) {
            console.log('%s %s', r.hits, r.rule);
        });

        return callback();
    });
};


/**
 * Gets the VMs that are affected by a rule
 */
Fwadm.prototype.do_vms = function (subcmd, opts, args, callback) {
    var uuid = cli.validateUUID(args[0]);
    LOG = util_log.create({ action: 'vms' }, true);

    return VM.lookup({}, { fields: fw.VM_FIELDS }, function (err, vms) {
        if (err) {
            cli.outputError(err, opts);
            return callback(err);
        }

        return fw.vms({ log: LOG, rule: uuid, vms: vms }, function (err2, res) {
            if (err2) {
                cli.outputError(err2, opts);
                return callback(err);
            }

            if (opts && opts.json) {
                console.log(cli.json(res));
                return callback();
            }

            console.log(res.join('\n'));
            return callback();
        });
    });
};



// --- Help text and other cmdln options



var HELP = {
    add: {
        summary: 'Add firewall rules or remote VMs.',
        synopses: [
            '{{name}} {{cmd}} -f <file>',
            '{{name}} {{cmd}} [-e] [--desc <description>] '
                + '[-g] [-O <owner uuid>] <rule>'
        ],
        options: [ OPTS.description, OPTS.enable, OPTS.file, OPTS.global,
            OPTS.owner_uuid ],
        examples: '    fwadm add -e -O $USER_UUID FROM any TO all vms ALLOW udp'
            + ' PORTS 67, 68\n'
            + '    fwadm add -g -e FROM any TO all vms ALLOW tcp PORT 22\n'
            + '    fwadm add <<EOF\n'
            + '    {\n'
            + '      "rules": [ {\n'
            + '        "description": "allow all ICMPv6 types",\n'
            + '        "rule": "FROM any TO all vms ALLOW icmp6 type all",\n'
            + '        "enabled": true,\n'
            + '        "global": true\n'
            + '      } ]\n'
            + '    }\n'
            + '    EOF\n'
    },
    add_rvm: {
        summary: 'Add a remote VM.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS]' ],
        options: [ OPTS.file ]
    },
    delete: {
        summary: 'Delete a rule.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <rule uuid>' ]
    },
    delete_rvm: {
        summary: 'Delete a remote VM.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <rvm uuid>' ]
    },
    disable: {
        summary: 'Disable a rule.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <vm uuid>' ]
    },
    enable: {
        summary: 'Enable a rule.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <vm uuid>' ]
    },
    get: {
        summary: 'Get a rule.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <rule uuid>' ]
    },
    get_rvm: {
        summary: 'Get a remote VM.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <rvm uuid>' ]
    },
    list: {
        summary: 'List rules.',
        synopses: [
            '{{name}} {{cmd}} [OPTIONS] -p [-d <char>]',
            '{{name}} {{cmd}} [OPTIONS] -j'
        ],
        options: [ OPTS.delim, OPTS.output_fields, OPTS.parseable ]
    },
    list_rvms: {
        summary: 'List remote VMs.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS]' ]
    },
    rules: {
        summary: 'List rules that apply to a VM.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <vm uuid>' ]
    },
    rvm_rules: {
        summary: 'List rules that apply to a remote VM.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <rvm uuid>' ]
    },
    start: {
        summary: 'Start a VM\'s firewall.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <vm uuid>' ]
    },
    status: {
        summary: 'Get the status of a VM\'s firewall.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <vm uuid>' ]
    },
    stats: {
        summary: 'Get rule statistics for a VM\'s firewall.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <vm uuid>' ]
    },
    stop: {
        summary: 'Stop a VM\'s firewall.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <vm uuid>' ]
    },
    update: {
        summary: 'Update firewall rules or data.',
        synopses: [
            '{{name}} {{cmd}} -f <file>',
            '{{name}} {{cmd}} <rule uuid> [-e] [--desc <description>] [-g] \\\n'
                + '    [-O <owner uuid>] <rule>'
        ],
        options: [ OPTS.description, OPTS.enable, OPTS.file, OPTS.global,
            OPTS.owner_uuid ]
    },
    vms: {
        summary: 'List the UUIDs of VMs affected by a rule.',
        synopses: [ '{{name}} {{cmd}} [OPTIONS] <rule uuid>' ]
    }
};


/**
 * Wrap a subcommand function with common checks
 */
function wrapSubcmd(func) {
    return function (subcmd, opts, args, callback) {
        if (opts.help) {
            this.do_help('help', {}, [ subcmd ], callback);
            return;
        }

        opts = this.opts = util_obj.mergeObjects(this.opts, opts);

        onlyif.rootInSmartosGlobal(function (err) {
            if (err) {
                console.error('FATAL: cannot run: %s', err);
                return process.exit(2);
            }

            func(subcmd, opts, args, callback);
        });
    };
}


// Help text and options for all commands
for (var cmd in HELP) {
    var do_key = 'do_' + cmd;
    var info = HELP[cmd];
    var proto = Fwadm.prototype[do_key];
    proto = Fwadm.prototype[do_key] = wrapSubcmd(proto);
    proto.help = info.summary + '\n\n{{usage}}\n\n{{options}}';
    if (info.hasOwnProperty('examples')) {
        proto.help += '\n\nExamples:\n\n' + info.examples;
    }

    proto.synopses = info.synopses;
    proto.options = (info.options || []).concat([
        OPTS.help, OPTS.dryrun, OPTS.json, OPTS.stdout, OPTS.verbose ]);
}



// --- Exports



/**
 * Main entry point
 */
function main() {
    var fwadm = new Fwadm();
    fwadm.main(process.argv, function (err2) {
        if (err2 && !cli.haveOutputErr()) {
            cli.outputError(err2, fwadm.opts);
            // This is a usage error - no need to flush logs
            process.exit(2);
        }

        // Potentially 3 different logs to flush: if we've only used
        // fw.js, just flush LOG.  If we've gone through VM.update
        // (for start / stop), we need to flush VM.log and VM.fw_log.
        util_log.flush([LOG, VM.log, VM.fw_log], function () {
            if (cli.haveOutputErr()) {
                process.exit(1);
            }

            process.exit(0);
        });
    });
}



module.exports = {
    main: main
};
