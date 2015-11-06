<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# sdc-firewaller-agent

This repository is part of the Joyent SmartDataCenter project (SDC).  For
contribution guidelines, issues, and general documentation, visit the main
[SDC](http://github.com/joyent/sdc) project page.

Firewaller is the SDC compute node agent responsible for syncing firewall
rules and associated VM data from FWAPI and VMAPI. For more information on
how it interacts with the rest of SmartDataCenter, consult the
[Firewall API architecture document](https://github.com/joyent/sdc-fwapi/blob/master/docs/architecture.md).


# Repository

    config.json         agent configuration file
    deps/               Git submodules for running 'make check'
    lib/                source files
    node_modules/       node.js deps (not checked in - installed via
                        `npm install`)
    npm/                npm postinstall scripts
    sbin/firewaller     agent executable
    smf/manifests       SMF manifests
    test/unit           Unit tests (nodeunit)
    tools/              dev tools from eng.git


# Development

To get started:

    git clone git@github.com:joyent/sdc-firewaller-agent.git
    cd sdc-firewaller-agent
    make

To run style and lint checks:

    make check

To run all checks and tests:

    make prepush

Before commiting/pushing run `make prepush` and, if possible, get a code
review. For non-trivial changes, a unit or integration test that covers the
new behaviour is required.


# Testing

## Unit tests

To run all tests:

    make test

To run an individual test:

    ./test/runtest ./test/unit/testname.test.js

## Integration tests

Since firewaller and the Firewall API are closely related, it is strongly
encouraged that you run the [Firewall API](https://github.com/joyent/sdc-fwapi)
integration tests before checking in.

To run the integration tests, on a **non-production** SDC server:

    sdc-login fwapi
    /opt/smartdc/fwapi/test/runtests

For more information, consult the [Firewall API README](https://github.com/joyent/sdc-fwapi/blob/master/README.md)
