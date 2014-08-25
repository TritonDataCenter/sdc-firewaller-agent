/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
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
