#!/usr/bin/env bash
# Publishes a packed package to the npm registry.
#
# Lives here rather than in a workflow so that adding a package is a tag in one
# moon.yml and no shared file. The release workflow's job is to know which
# project a tag names; everything about how a package reaches npm is this
# script.
#
# Reads:
#   NPM_DIST     directory the build wrote to, relative to the project (default: dist)
#   NPM_DRY_RUN  set to 1 to run every check and skip the upload
#   NPM_TOKEN    required unless NPM_DRY_RUN=1
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }

# Absolute here rather than project-relative: kbve builds these packages to
# dist/packages/npm/<name> at the workspace root.
dist="${NPM_DIST:-dist}"
[ -d "$dist" ] || die "$dist does not exist. The build task should have produced it."
# pack.mjs puts the manifest here after verifying the tarball. Its absence means
# the pack task did not run, and publishing would ship whatever is on disk.
[ -f "$dist/package.json" ] || die "$dist has no package.json. The pack task should have copied it."

# Read through argv rather than interpolating into the require(): $dist is an
# absolute path here, and './' + an absolute path is not a module specifier.
read_manifest() { node -p "require(process.argv[1])[process.argv[2]] || ''" "$dist/package.json" "$1"; }
name=$(read_manifest name)
version=$(read_manifest version)
[ -n "$name" ] || die "$dist/package.json has no name."
[ -n "$version" ] || die "$dist/package.json has no version."

# A version already on the registry cannot be overwritten, so npm publish would
# fail late with a 403. Checking first turns a re-run of an already-released tag
# into a clear message instead. A registry that cannot be reached is not an
# error here -- publish will say so itself.
released=$(npm view "$name@$version" version 2>/dev/null || true)

if [ "${NPM_DRY_RUN:-}" = "1" ]; then
  # A dry run reports this rather than failing on it. The version in the
  # manifest stays equal to the released one for the whole life of a release,
  # and `moon check` runs this task, so failing here would leave every check in
  # the repository red from the moment a package is published until someone
  # happens to bump it.
  if [ -n "$released" ]; then
    echo "dry run: $name@$version is already on the registry; a real publish would need a version bump first"
  else
    echo "dry run: would publish $name@$version from $dist"
  fi
  exit 0
fi

# Past the dry run this is fatal: an npm version is immutable, so republishing
# one is not something to warn about and continue through.
[ -z "$released" ] || die "$name@$version is already on the registry. Bump the version in package.json and tag again -- a published version is immutable."

[ -n "${NPM_TOKEN:-}" ] || die "NPM_TOKEN is not set. Create an automation token at https://www.npmjs.com/settings/~/tokens."

# The credential goes in a config file outside the package directory: anything
# written inside $dist risks being packed, and a token in a tarball is a
# published secret. Removed on any exit, including a failed publish.
npmrc="$(mktemp)"
trap 'rm -f "$npmrc"' EXIT
printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$npmrc"

# --access public is explicit because @kbve is a scope, and npm defaults a
# scoped package to restricted -- the publish succeeds and nobody can install it.
NPM_CONFIG_USERCONFIG="$npmrc" npm publish "$dist" --access public
echo "published $name@$version"
