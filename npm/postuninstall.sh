#!/bin/bash

export SMFDIR=$npm_config_smfdir
NAME=firewaller

if [[ $(uname -s) == "SunOS" ]]; then
    svcadm disable -s $NAME
    svccfg delete $NAME
fi

rm -f "$SMFDIR/$NAME.xml"
