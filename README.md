<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# SDC Firewaller Agent

This repository is part of the SmartDataCenter (SDC) project. For
contribution guidelines, issues, and general documentation, visit the
[main SDC project](http://github.com/joyent/sdc).

## Overview

Firewaller is the SmartDataCenter (SDC) compute node agent responsible for
syncing firewall rules and associated VM data from firewall API (FWAPI) and
virtual machine API (VMAPI). For more information on
how it interacts with the rest of SmartDataCenter, consult the
[Firewall API architecture document](https://github.com/joyent/sdc-fwapi/blob/master/docs/architecture.md).


## Code Layout

    deps/               code from other projects including SmartOS fwadm
    lib/                source files
    node_modules/       node.js deps (not checked in - installed via
                        `npm install`)
    npm/                npm postinstall scripts
    sbin/firewaller     agent executable
    smf/manifests       SMF manifests
    test/unit           Unit tests (nodeunit)
    tools/              dev tools from eng.git
    config.json         agent configuration file


## Development

To get started:

    git clone git@github.com:joyent/sdc-firewaller-agent.git
    cd sdc-firewaller-agent
    make

To run style and lint checks:

    make check

To run all checks and tests:

    make prepush

Before pushing run `make prepush` and, if possible, get a code
review. For non-trivial changes, a unit or integration test that covers the
new behavior is required.


## Testing

### Unit Tests

To run all tests:

    make test

To run an individual test:

    ./test/runtest ./test/unit/testname.test.js

### Integration Tests

Since firewaller and the firewall API are closely related, it is strongly
encouraged that you run the [FWAPI](https://github.com/joyent/sdc-fwapi)
integration tests before pushing changes.

To run the integration tests, on a **non-production** SDC server:

    sdc-login fwapi
    /opt/smartdc/fwapi/test/runtests

For more information, consult the [Firewall API README](https://github.com/joyent/sdc-fwapi/blob/master/README.md)


## License

SDC Firewaller Agent is licensed under the
[Mozilla Public License version 2.0](http://mozilla.org/MPL/2.0/).
See the file LICENSE.
