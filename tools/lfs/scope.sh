#!/usr/bin/env bash
# Materializes every game's LFS assets that fall under a path.
#
# A docker build copies a source_path that may contain more than one game's
# assets, and each game's blobs live on its own Forgejo repo. So "pull the LFS
# under this directory" is a loop over the remotes table, not a single pull.
#
# The loop it replaces named five games inline while the table listed eight, so
# a build whose source_path covered cleanroom, herbmail or friendslop assets
# pulled nothing for them and shipped ~130-byte pointer stubs into the image.
#
# Reads:
#   LFS_SCOPE       required, the path being built, e.g. apps/herbmail
#   FORGEJO_USER    required
#   FORGEJO_TOKEN   required
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scope="${LFS_SCOPE:?LFS_SCOPE is not set}"
scope="${scope%/}"

pulled=0
while read -r game; do
	prefix="$("$here/remotes.sh" path "$game")"
	# Only games this build actually copies. A prefix outside the scope is
	# another game's assets and pulling it would cost gigabytes for nothing.
	case "$prefix" in
	"$scope" | "$scope"/*) ;;
	*) continue ;;
	esac
	# Tracked-file check first: ensure.sh would skip anyway, but this keeps
	# the log to the games that are really in play.
	#
	# Captured rather than piped into `grep -q`. Under pipefail, grep leaves
	# on its first match, git-lfs takes a SIGPIPE mid-listing, and the
	# pipeline reports 141 -- indistinguishable from "this game has no
	# tracked files", so the pull is skipped and the image ships stubs.
	tracked=$(git lfs ls-files -I "$prefix/**" 2>/dev/null || true)
	[ -n "$tracked" ] || continue
	echo "→ $game under $prefix"
	LFS_REMOTE="$game" LFS_INCLUDE="$prefix" bash "$here/ensure.sh"
	pulled=$((pulled + 1))
done < <("$here/remotes.sh" list)

echo "::notice::Resolved LFS for $pulled game(s) under $scope"
