BROWSERIFY = node_modules/.bin/browserify
UGLIFY = node_modules/.bin/uglifyjs
XYZ = node_modules/.bin/xyz

BROWSER_DST = ./bin/.publish/hms.js
BROWSER_DST_MIN = ./bin/.publish/hms.min.js

.PHONY: browser-standalone./bin/.publish/hms.js
browser-standalone: $(BROWSER_DST) $(BROWSER_DST_MIN)

$(BROWSER_DST): src/hm-search.js
	$(BROWSERIFY) --standalone HMS -- '$<' > '$@'

$(BROWSER_DST_MIN): $(BROWSER_DST)
	$(UGLIFY) '$<' > '$@'

.PHONY: release-major release-minor release-patch
release-major release-minor release-patch:
	@$(XYZ) --increment $(@:release-%=%) --publish-command "./bin/publish.sh"

