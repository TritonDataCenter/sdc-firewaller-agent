#
# Copyright (c) 2013, Joyent, Inc. All rights reserved.
#
# Firewaller agent Makefile
#



#
# Tools
#
TAP		:= ./node_modules/.bin/tap



#
# Files
#
JS_FILES	:= $(shell find lib test -name '*.js') sbin/firewaller
JSON_FILES	 = package.json
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE	 = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)
JSSTYLE_FLAGS	 = -f tools/jsstyle.conf
REPO_MODULES	 = src/node-dummy
SMF_MANIFESTS_IN = smf/manifests/firewaller.xml.in
SDC_CLIENTS		 = node_modules/sdc-clients

# Should be the same version as the platform's /usr/node/bin/node.
#NODE_PREBUILT_VERSION=v0.8.20
#NODE_PREBUILT_TAG=gz

ifeq ($(shell uname -s),SunOS)
	NODE_PREBUILT_VERSION=v0.8.20
	NODE_PREBUILT_TAG=gz
endif

include ./tools/mk/Makefile.defs
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.defs
else
	NPM_EXEC :=
	NPM = npm
	#include ./tools/mk/Makefile.node.defs
endif
include ./tools/mk/Makefile.smf.defs

NAME		:= firewaller
RELEASE_TARBALL := $(NAME)-$(STAMP).tgz
TMPDIR          := /tmp/$(STAMP)
DSTDIR          := $(TMPDIR)/$(NAME)


#
# Repo-specific targets
#
.PHONY: all
all: $(SMF_MANIFESTS) | $(TAP) $(REPO_DEPS) $(SDC_CLIENTS)

$(SDC_CLIENTS):
	./tools/mk-sdc-clients-light.sh $(shell json -f package.json platformDependencies.sdc-clients | cut -d'#' -f2) $(SDC_CLIENTS) fwapi.js vmapi.js

$(TAP): node_modules

# Remove binary modules - we use the ones in the platform that are built
# against the platform node
node_modules: | $(NPM_EXEC)
	$(NPM) install
	rm -rf node_modules/microtime
	rm -rf node_modules/dtrace-provider

CLEAN_FILES += $(TAP) ./node_modules/tap

.PHONY: test
test: $(TAP)
	TAP=1 $(TAP) test/*.test.js

.PHONY: release
release: all docs $(SMF_MANIFESTS)
	@echo "Building $(RELEASE_TARBALL)"
	@mkdir -p $(DSTDIR)
	(git symbolic-ref HEAD | awk -F/ '{print $$3}' && git describe) > $(DSTDIR)/describe
	cp -r \
    $(TOP)/config.json \
    $(TOP)/lib \
    $(TOP)/node_modules \
    $(TOP)/npm \
    $(TOP)/package.json \
    $(TOP)/sbin \
    $(TOP)/smf \
    $(DSTDIR)
	# Cleanup dev / unused bits
	rm -rf $(DSTDIR)/node_modules/nodeunit
	(cd $(TMPDIR) && $(TAR) -zcf $(TOP)/$(RELEASE_TARBALL) *)
	@rm -rf $(TMPDIR)

.PHONY: publish
publish: release
	@if [[ -z "$(BITS_DIR)" ]]; then \
		@echo "error: 'BITS_DIR' must be set for 'publish' target"; \
		exit 1; \
	fi
	mkdir -p $(BITS_DIR)/$(NAME)
	cp $(TOP)/$(RELEASE_TARBALL) $(BITS_DIR)/$(NAME)/$(RELEASE_TARBALL)


include ./tools/mk/Makefile.deps
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.targ
else
	include ./tools/mk/Makefile.node.targ
endif
include ./tools/mk/Makefile.smf.targ
include ./tools/mk/Makefile.targ
