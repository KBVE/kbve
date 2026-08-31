#!/usr/bin/env bash
# Prints the version a manifest declares.
#
# One implementation, because there were four. utils-publish-docker-image.yml
# had the same `case` over the file extension in three separate steps, and
# tools/release/verify-tag.mjs had a fourth with different rules -- which meant
# the version a tag was checked against and the version its image was tagged
# with could disagree, and nothing downstream could tell.
#
# The rules here are verify-tag.mjs's, deliberately:
#   - a private package.json is not a version claim, it is the npm stub
#     convention for "never published here"
#   - the TOML readers stop at the next table header, so a dependency's version
#     further down the file is not mistaken for the package's own
#
# Usage: version.sh <path-to-manifest>
set -euo pipefail

file="${1:?usage: version.sh <path-to-manifest>}"
[ -f "$file" ] || { echo "::error::$file does not exist" >&2; exit 1; }

case "$file" in
*.json)
	# tauri.conf.json and package.json are both plain JSON with a version.
	version=$(node -p "
		const p = require('$PWD/$file');
		p.private === true ? '' : (p.version || '')
	" 2>/dev/null || echo '')
	;;
*.mdx)
	version=$(sed -n 's/^version: *"\([^"]*\)"/\1/p' "$file" | head -1)
	;;
*.uplugin)
	version=$(node -p "require('$PWD/$file').VersionName || ''" 2>/dev/null || echo '')
	;;
*project.godot)
	version=$(sed -n '/^\[application\]/,/^\[/{s|^config/version *= *"\([^"]*\)".*|\1|p;}' "$file" | head -1)
	;;
*Cargo.toml)
	version=$(sed -n '/^\[package\]/,/^\[/{s/^version *= *"\([^"]*\)".*/\1/p;}' "$file" | head -1)
	;;
*pyproject.toml)
	version=$(sed -n '/^\[project\]/,/^\[/{s/^version *= *"\([^"]*\)".*/\1/p;}' "$file" | head -1)
	;;
*)
	# version.toml, which is a bare key in most of the tree and under
	# [package] for the four docker base images under packages/docker.
	version=$(sed -n 's/^version *= *"\([^"]*\)".*/\1/p' "$file" | head -1)
	if [ -z "$version" ]; then
		version=$(sed -n '/^\[package\]/,/^\[/{s/^version *= *"\([^"]*\)".*/\1/p;}' "$file" | head -1)
	fi
	;;
esac

[ -n "$version" ] || { echo "::error::$file declares no version" >&2; exit 1; }
printf '%s\n' "$version"
