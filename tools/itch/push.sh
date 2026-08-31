#!/usr/bin/env bash
# Publishes a built web game to its itch.io page.
#
# Lives here rather than in a workflow so that adding a game is one moon.yml
# and no shared file. The workflow's job is to know which project a tag names;
# everything about how a game reaches itch is this script plus the project's
# own env block.
#
# Reads:
#   ITCH_TARGET       required, e.g. kbve/isometric:html5
#   ITCH_DIST         directory to upload, relative to the project (default: dist)
#   ITCH_USERVERSION  version label on the channel (default: the manifest's)
#   ITCH_DRY_RUN      set to 1 to run every check and skip the upload
#   BUTLER_API_KEY    required unless ITCH_DRY_RUN=1
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }

[ -n "${ITCH_TARGET:-}" ] || die "ITCH_TARGET is not set. Add it to the project's env block in moon.yml, e.g. 'kbve/isometric:html5'."

dist="${ITCH_DIST:-dist}"
[ -d "$dist" ] || die "$dist does not exist. The build task should have produced it."

# itch serves an HTML upload from an index.html at its root. Without one the
# push succeeds and the page shows itch's own "no index" error, which reads to
# a player as a broken game rather than a broken upload.
[ -f "$dist/index.html" ] || die "$dist has no index.html, so itch would serve an error page."

# The version label defaults to the manifest, which is the same number the
# release tag is checked against. Passing it explicitly stays possible for a
# one-off, but the default keeps one source of truth.
# Both manifests are read because neither is universal: a Vite game has a
# package.json and a Bevy one has a Cargo.toml. The sed is not a TOML parser on
# purpose -- it stops at the next table header, so a dependency's version
# further down the file cannot be mistaken for the package's own.
version="${ITCH_USERVERSION:-}"
# A private package.json is not a version claim -- it is the npm stub
# convention for "never published here", and its 0.0.0 would label the build
# with a version nothing else agrees with. tools/release/verify-tag.mjs skips
# these for the same reason, and the two have to agree or a tag and the build
# it produced would carry different numbers.
if [ -z "$version" ] && [ -f package.json ]; then
  version=$(node -p "const p=require('./package.json'); p.private === true ? '' : (p.version || '')" 2>/dev/null || echo '')
fi
if [ -z "$version" ] && [ -f Cargo.toml ]; then
  version=$(sed -n '/^\[package\]/,/^\[/{s/^version *= *"\([^"]*\)".*/\1/p;}' Cargo.toml | head -1)
fi
for godot in project.godot godot/project.godot; do
  [ -n "$version" ] && break
  [ -f "$godot" ] || continue
  version=$(sed -n '/^\[application\]/,/^\[/{s|^config/version *= *"\([^"]*\)".*|\1|p;}' "$godot" | head -1)
done
# A Tauri app keeps its version in tauri.conf.json; the package.json beside it
# is a private stub whose 0.0.0 would otherwise win the check above.
if [ -z "$version" ] && [ -f src-tauri/tauri.conf.json ]; then
  version=$(node -p "require('./src-tauri/tauri.conf.json').version || ''" 2>/dev/null || echo '')
fi
# The image-only and shell projects have no language manifest at all, so
# version.toml is theirs. Last, because a project with both should be labelled
# from the manifest its artifact is actually built from.
if [ -z "$version" ] && [ -f version.toml ]; then
  version=$(sed -n 's/^version *= *"\([^"]*\)".*/\1/p' version.toml | head -1)
fi
[ -n "$version" ] || die "No version to label the build with. Set ITCH_USERVERSION, or add a version to package.json, Cargo.toml, project.godot, src-tauri/tauri.conf.json or version.toml."

if [ "${ITCH_DRY_RUN:-}" = "1" ]; then
  echo "dry run: would push $dist -> $ITCH_TARGET as $version"
  exit 0
fi

[ -n "${BUTLER_API_KEY:-}" ] || die "BUTLER_API_KEY is not set. Create one at https://itch.io/user/settings/api-keys."

# Fetched from itch's own broth channel rather than a third-party action, so
# nothing outside itch and GitHub is trusted with the API key. Skipped when a
# butler is already on PATH, which is the local case.
if ! command -v butler >/dev/null 2>&1; then
  tmp="${RUNNER_TEMP:-/tmp}/butler"
  mkdir -p "$tmp"
  curl -fsSL -o "$tmp/butler.zip" \
    https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default
  unzip -q -o "$tmp/butler.zip" -d "$tmp"
  chmod +x "$tmp/butler"
  PATH="$tmp:$PATH"
  export PATH
fi

butler push "$dist" "$ITCH_TARGET" --userversion "$version"
butler status "$ITCH_TARGET"
