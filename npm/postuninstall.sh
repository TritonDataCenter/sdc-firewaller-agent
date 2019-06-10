#!/bin/bash
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright 2019 Joyent, Inc.
#

if [[ "${SDC_AGENT_SKIP_LIFECYCLE:-no}" = "yes" ]]; then
    printf 'Running during package build; skipping lifecycle script.\n' >&2
    exit 0
fi

export SMFDIR=$npm_config_smfdir
NAME=firewaller

if [[ $(uname -s) == "SunOS" ]]; then
    svcadm disable -s $NAME
    svccfg delete $NAME
    svcadm disable -s $NAME-agent-setup
    svccfg delete $NAME-agent-setup
    svcadm disable -s $NAME-config-migration
    svccfg delete $NAME-config-migration
fi

rm -f "$SMFDIR/$NAME.xml"
rm -f "$SMFDIR/$NAME-agent-setup.xml"
rm -f "$SMFDIR/$NAME-config-migration.xml"
