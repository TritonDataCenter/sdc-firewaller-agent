<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# Firewaller

Repository: <git@git.joyent.com:firewaller.git>
Browsing: <https://mo.joyent.com/firewaller>
Who: Rob Gulewich
Tickets/bugs: <https://devhub.joyent.com/jira/browse/FWAPI>


# Overview

Firewaller is the SDC compute node agent responsible for syncing firewall
rules and associated VM data from FWAPI and VMAPI.


# Repository

    deps/           Git submodules for running 'make check'
    lib/            Source files.
    node_modules/   Node.js deps
    npm/            npm postinstall scripts
    smf/manifests   SMF manifests
    tools/          dev tools from eng.git


# Development

To get started:

    git clone git@git.joyent.com:firewaller.git
    cd firewaller
    git submodule update --init
    make all

Before commiting/pushing run `make prepush` and, if possible, get a code
review.
