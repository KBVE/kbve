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
	# Only games this build actually copies, and only the part of them it
	# copies. A prefix unrelated to the scope is another game's assets and
	# pulling it would cost gigabytes for nothing.
	#
	# The two directions are not the same pull:
	#
	#   prefix inside scope   a build of apps/agones covering arpg -- take the
	#                         whole game, the scope holds all of it
	#   scope inside prefix   one project of a multi-project remote, such as
	#                         apps/arcade/yuki against the arcade prefix
	#                         apps/arcade -- take the scope, or the pull drags
	#                         in every sibling game on that endpoint
	#
	# Only the first was handled, so a project sharing a remote with its
	# siblings matched nothing and pulled nothing. That is silent: the build
	# succeeds on ~130-byte pointer stubs and fails later as a corrupt model.
	case "$prefix" in
	"$scope" | "$scope"/*) include="$prefix" ;;
	*)
		case "$scope" in
		"$prefix"/*) include="$scope" ;;
		*) continue ;;
		esac
		;;
	esac
	# Tracked-file check first: ensure.sh would skip anyway, but this keeps
	# the log to the games that are really in play.
	#
	# Captured rather than piped into `grep -q`. Under pipefail, grep leaves
	# on its first match, git-lfs takes a SIGPIPE mid-listing, and the
	# pipeline reports 141 -- indistinguishable from "this game has no
	# tracked files", so the pull is skipped and the image ships stubs.
	tracked=$(git lfs ls-files -I "$include/**" 2>/dev/null || true)
	[ -n "$tracked" ] || continue
	echo "→ $game under $include"
	LFS_REMOTE="$game" LFS_INCLUDE="$include" bash "$here/ensure.sh"
	pulled=$((pulled + 1))
done < <("$here/remotes.sh" list)

echo "::notice::Resolved LFS for $pulled game(s) under $scope"
