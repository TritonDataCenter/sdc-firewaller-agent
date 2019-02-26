#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2019, Joyent, Inc.
#

#
# Firewaller agent Makefile
#

#
# Files
#


BASH_FILES  := npm/postinstall.sh npm/postuninstall.sh
JS_FILES        := $(shell find lib test -name '*.js') main.js
JSON_FILES       = package.json config.json
JSL_CONF_NODE    = tools/jsl.node.conf
JSL_FILES_NODE   = $(JS_FILES)
JSSTYLE_FILES    = $(JS_FILES)
JSSTYLE_FLAGS    = -f tools/jsstyle.conf
ESLINT_FILES	 = $(JS_FILES)
REPO_MODULES	 = src/node-dummy
SMF_MANIFESTS_IN = smf/manifests/firewaller.xml.in

ENGBLD_REQUIRE := $(shell git submodule update --init deps/eng)
include ./deps/eng/tools/mk/Makefile.defs
TOP ?= $(error Unable to access eng.git submodule Makefiles.)

ifeq ($(shell uname -s),SunOS)
	NODE_PREBUILT_VERSION=v0.10.48
	NODE_PREBUILT_TAG=gz
	NODE_PREBUILT_IMAGE=fd2cc906-8938-11e3-beab-4359c665ac99
endif

ifeq ($(shell uname -s),SunOS)
	include ./deps/eng/tools/mk/Makefile.node_prebuilt.defs
else
	NPM_EXEC :=
	NPM = npm
endif
include ./deps/eng/tools/mk/Makefile.smf.defs

NAME		:= firewaller
RELEASE_TARBALL := $(NAME)-$(STAMP).tgz
RELEASE_MANIFEST := $(NAME)-$(STAMP).manifest
RELSTAGEDIR          := /tmp/$(NAME)-$(STAMP)
DSTDIR          := $(RELSTAGEDIR)/$(NAME)

NODEUNIT_EXEC := ./node_modules/.bin/nodeunit
NODEUNIT := $(NODE) $(NODEUNIT_EXEC)



#
# Repo-specific targets
#

# Remove binary modules - we use the ones in the platform that are built
# against the platform node
.PHONY: all
all: $(SMF_MANIFESTS) | $(NODE_EXEC) $(NPM_EXEC) $(REPO_DEPS)
	SDC_AGENT_SKIP_LIFECYCLE=yes MAKE_OVERRIDES="CTFCONVERT=/bin/true CTFMERGE=/bin/true" $(NPM) install --production
	cp -r deps/fw-overlay/* node_modules/fw

CLEAN_FILES += node_modules
DISTCLEAN_FILES += $(NAME)-*.manifest $(NAME)-*.tgz

.PHONY: test
test: $(NODEUNIT_EXEC)
	@(for F in test/unit/*.test.js; do \
		echo "# $$F" ;\
		$(NODEUNIT) --reporter tap $$F ;\
		[[ $$? == "0" ]] || exit 1; \
	done)

.PHONY: release
release: all docs $(SMF_MANIFESTS)
	@echo "Building $(RELEASE_TARBALL)"
	@mkdir -p $(DSTDIR)
	(git symbolic-ref HEAD | awk -F/ '{print $$3}' && git describe) > $(DSTDIR)/describe
	cp -r \
    $(TOP)/config.json \
    $(TOP)/main.js \
    $(TOP)/lib \
    $(TOP)/node_modules \
    $(TOP)/npm \
    $(TOP)/package.json \
    $(TOP)/sbin \
    $(TOP)/smf \
    $(DSTDIR)
	uuid -v4 > $(DSTDIR)/image_uuid
	cp -PR $(NODE_INSTALL) $(DSTDIR)/node
	# Cleanup dev / unused bits
	rm -rf $(DSTDIR)/node_modules/nodeunit
	(cd $(RELSTAGEDIR) && $(TAR) -I pigz -cf $(TOP)/$(RELEASE_TARBALL) *)
	cat $(TOP)/manifest.tmpl | sed \
		-e "s/UUID/$$(cat $(DSTDIR)/image_uuid)/" \
		-e "s/NAME/$$(json name < $(TOP)/package.json)/" \
		-e "s/VERSION/$$(json version < $(TOP)/package.json)/" \
		-e "s/DESCRIPTION/$$(json description < $(TOP)/package.json)/" \
		-e "s/BUILDSTAMP/$(STAMP)/" \
		-e "s/SIZE/$$(stat --printf="%s" $(TOP)/$(RELEASE_TARBALL))/" \
		-e "s/SHA/$$(openssl sha1 $(TOP)/$(RELEASE_TARBALL) \
		    | cut -d ' ' -f2)/" \
		> $(TOP)/$(RELEASE_MANIFEST)
	@rm -rf $(RELSTAGEDIR)

.PHONY: publish
publish: release
	mkdir -p $(ENGBLD_BITS_DIR)/$(NAME)
	cp $(TOP)/$(RELEASE_TARBALL) $(ENGBLD_BITS_DIR)/$(NAME)/$(RELEASE_TARBALL)
	cp $(TOP)/$(RELEASE_MANIFEST) $(ENGBLD_BITS_DIR)/$(NAME)/$(RELEASE_MANIFEST)

include ./deps/eng/tools/mk/Makefile.deps
ifeq ($(shell uname -s),SunOS)
	include ./deps/eng/tools/mk/Makefile.node_prebuilt.targ
else
	include ./deps/eng/tools/mk/Makefile.node.targ
endif
include ./deps/eng/tools/mk/Makefile.smf.targ
include ./deps/eng/tools/mk/Makefile.targ
