/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Agent tasks
 */

var TASKS = {
    'fw.add_rule': 'add-rule',
    'fw.del_rule': 'del-rule',
    'fw.update_rule': 'update-rule',
    'ping': 'ping',
    'sync': 'sync',
    'vm.add': 'vm-add',
    'vm.delete': 'vm-delete',
    'vm.update': 'vm-update'
};

for (var t in TASKS) {
    module.exports[t] = require('./' + TASKS[t]).run;
}
