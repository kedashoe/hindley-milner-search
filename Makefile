XYZ = node_modules/.bin/xyz

.PHONY: release-major release-minor release-patch
release-major release-minor release-patch:
	@$(XYZ) --increment $(@:release-%=%) --publish-command "./bin/publish.sh"

