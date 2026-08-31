#!/usr/bin/env bash
# Resolves a game name to its LFS endpoint or path prefix.
#
# The map was a case statement inside kbve.sh that CI reached by shelling out
# to `./kbve.sh -lfs <game> path`. It is data now, in remotes.tsv, so a new
# game is one line rather than an edit to a 1500-line script that the docker
# publish path happens to depend on.
#
# Usage: remotes.sh url|path <game>
#        remotes.sh list
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
table="$here/remotes.tsv"

field() {
	# Comments and blanks are skipped; the read splits on the tab.
	local want="$1" col="$2" game url prefix
	while IFS=$'\t' read -r game url prefix; do
		case "$game" in '' | '#'*) continue ;; esac
		[ "$game" = "$want" ] || continue
		case "$col" in
		url) printf '%s\n' "$url" ;;
		path) printf '%s\n' "$prefix" ;;
		esac
		return 0
	done < "$table"
	return 1
}

names() {
	local game rest
	while IFS=$'\t' read -r game rest; do
		case "$game" in '' | '#'*) continue ;; esac
		printf '%s\n' "$game"
	done < "$table"
}

case "${1:-}" in
url | path)
	game="${2:?usage: remotes.sh $1 <game>}"
	field "$game" "$1" && exit 0
	echo "Unknown game '$game'. Known: $(names | paste -sd, -)" >&2
	exit 1
	;;
list)
	names
	;;
*)
	echo "usage: remotes.sh url|path <game> | remotes.sh list" >&2
	exit 1
	;;
esac
