#
# Copyright (c) 2014, Joyent, Inc. All rights reserved.
#
# Firewaller agent Makefile
#



#
# Tools
#
NODEUNIT		:= ./node_modules/.bin/nodeunit



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

ifeq ($(shell uname -s),SunOS)
	NODE_PREBUILT_VERSION=v0.10.26
	NODE_PREBUILT_TAG=gz
	NODE_PREBUILT_IMAGE=fd2cc906-8938-11e3-beab-4359c665ac99
endif

include ./tools/mk/Makefile.defs
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.defs
else
	NPM_EXEC :=
	NPM = npm
endif
include ./tools/mk/Makefile.smf.defs

NAME		:= firewaller
RELEASE_TARBALL := $(NAME)-$(STAMP).tgz
RELEASE_MANIFEST := $(NAME)-$(STAMP).manifest
RELSTAGEDIR          := /tmp/$(STAMP)
DSTDIR          := $(RELSTAGEDIR)/$(NAME)


#
# Repo-specific targets
#
.PHONY: all
all: $(SMF_MANIFESTS) | $(NODEUNIT) $(REPO_DEPS) $(SDC_CLIENTS)

$(SDC_CLIENTS):
	./tools/mk-sdc-clients-light.sh $(shell json -f package.json platformDependencies.sdc-clients | cut -d'#' -f2) $(SDC_CLIENTS) fwapi.js vmapi.js

$(NODEUNIT): node_modules

# Remove binary modules - we use the ones in the platform that are built
# against the platform node
node_modules: | $(NPM_EXEC)
	$(NPM) install
	cp -r deps/fw node_modules/

CLEAN_FILES += $(NODEUNIT) ./node_modules/nodeunit

.PHONY: test
test: $(NODEUNIT)
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
	(cd $(RELSTAGEDIR) && $(TAR) -zcf $(TOP)/$(RELEASE_TARBALL) *)
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
	@if [[ -z "$(BITS_DIR)" ]]; then \
		@echo "error: 'BITS_DIR' must be set for 'publish' target"; \
		exit 1; \
	fi
	mkdir -p $(BITS_DIR)/$(NAME)
	cp $(TOP)/$(RELEASE_TARBALL) $(BITS_DIR)/$(NAME)/$(RELEASE_TARBALL)
	cp $(TOP)/$(RELEASE_MANIFEST) $(BITS_DIR)/$(NAME)/$(RELEASE_MANIFEST)


include ./tools/mk/Makefile.deps
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.targ
else
	include ./tools/mk/Makefile.node.targ
endif
include ./tools/mk/Makefile.smf.targ
include ./tools/mk/Makefile.targ
