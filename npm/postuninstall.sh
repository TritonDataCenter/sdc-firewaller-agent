#!/bin/bash
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2019, Joyent, Inc.
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
fi

rm -f "$SMFDIR/$NAME.xml"
