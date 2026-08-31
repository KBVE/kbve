#!/usr/bin/env bash
# Exercises ensure.sh's resolution against throwaway repos.
#
# Dry-run only: the pull itself needs a Forgejo endpoint and a token, so what
# is tested here is everything that decides *which* endpoint gets contacted and
# *whether* a pull happens at all -- which is where the six copies this script
# replaced disagreed with each other.
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ensure.sh"
pass=0
fail=0

check() {
	local name="$1" expect="$2" got="$3"
	if [[ "$got" == *"$expect"* ]]; then
		pass=$((pass + 1))
	else
		fail=$((fail + 1))
		printf 'FAIL %s\n  expected to contain: %s\n  got: %s\n' "$name" "$expect" "$got"
	fi
}

repo() {
	local dir
	dir="$(mktemp -d)"
	git -C "$dir" init -q
	git -C "$dir" config user.email t@t.t
	git -C "$dir" config user.name t
	printf '%s\n' "$dir"
}

# A prefix that tracks nothing is a no-op, not a failure: most projects that
# call this have no LFS at all and the pull would do nothing.
d="$(repo)"
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_INCLUDE=apps/nothing bash "$script" 2>&1)
check "untracked prefix skips" "skipping" "$out"

# ...unless the caller says an empty listing means a broken .gitattributes
# rather than an asset-free project.
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_REQUIRED=1 LFS_INCLUDE=apps/nothing bash "$script" 2>&1 || true)
check "untracked prefix with LFS_REQUIRED fails" "tracks no LFS files" "$out"
rm -rf "$d"

# With files tracked and no .lfsconfig, objects come from the checkout's own
# remote and need no extra credentials.
d="$(repo)"
mkdir -p "$d/apps/game"
printf '*.bin filter=lfs diff=lfs merge=lfs -text\n' > "$d/.gitattributes"
printf 'version https://git-lfs.github.com/spec/v1\noid sha256:%064d\nsize 1\n' 0 > "$d/apps/game/a.bin"
git -C "$d" add -A
git -C "$d" -c commit.gpgsign=false commit -qm t
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_INCLUDE=apps/game bash "$script" 2>&1)
check "no lfsconfig uses origin" "from origin (github-native)" "$out"

# A kbve host means Forgejo, which the checkout never authenticated.
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_INCLUDE=apps/game LFS_ENDPOINT=https://git.kbve.com/KBVE/friendslop.git/info/lfs bash "$script" 2>&1 || true)
check "forgejo endpoint without creds fails" "FORGEJO_USER / FORGEJO_TOKEN missing" "$out"

# The endpoints in the tree are written in several shapes; all normalize to the
# one path git-lfs actually talks to. Getting this wrong sends the pull at a
# valid-looking URL that 404s every object.
for url in \
	"https://git.kbve.com/KBVE/friendslop.git/info/lfs" \
	"https://git.kbve.com/KBVE/friendslop.git" \
	"https://git.kbve.com/KBVE/friendslop" \
	"ssh://git@git.kbve.com/KBVE/friendslop.git"; do
	out=$(cd "$d" && LFS_DRY_RUN=1 LFS_INCLUDE=apps/game FORGEJO_USER=u FORGEJO_TOKEN=t \
		LFS_ENDPOINT="$url" bash "$script" 2>&1)
	check "normalizes $url" "git.kbve.com/KBVE/friendslop.git/info/lfs (forgejo)" "$out"
done

# LFS_ENDPOINT has to win over the root .lfsconfig, because the root file names
# KBVE/rareicon for the whole monorepo and most games' blobs are not there.
printf '[lfs]\n\turl = https://git.kbve.com/KBVE/rareicon.git/info/lfs\n' > "$d/.lfsconfig"
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_INCLUDE=apps/game FORGEJO_USER=u FORGEJO_TOKEN=t bash "$script" 2>&1)
check "root lfsconfig is the default" "KBVE/rareicon.git/info/lfs" "$out"
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_INCLUDE=apps/game FORGEJO_USER=u FORGEJO_TOKEN=t \
	LFS_ENDPOINT=https://git.kbve.com/KBVE/chuck.git/info/lfs bash "$script" 2>&1)
check "LFS_ENDPOINT overrides root lfsconfig" "KBVE/chuck.git/info/lfs" "$out"

# The external-clone path pulls a repo that has no subdirectory of interest,
# and asks for it as '.' or '**'. Both mean the whole checkout; treating either
# as a path prefix builds the pathspec "/**", which matches nothing, pulls
# nothing and exits 0.
for whole in "." "**"; do
	out=$(cd "$d" && LFS_DRY_RUN=1 LFS_INCLUDE="$whole" FORGEJO_USER=u FORGEJO_TOKEN=t bash "$script" 2>&1)
	check "whole-repo include '$whole'" "would pull the whole checkout from" "$out"
done

# A game name is the whole answer: which Forgejo repo holds the blobs and
# which paths that game owns. The two used to be a case statement inside
# kbve.sh that CI reached by shelling out to it.
# The prefix it resolves is the game's own tree, which this throwaway repo does
# not have -- so the skip names it, which is what proves the lookup.
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_REMOTE=friendslop FORGEJO_USER=u FORGEJO_TOKEN=t bash "$script" 2>&1)
check "LFS_REMOTE resolves the prefix" "under apps/friendslop/godot-friendslop" "$out"

# An explicit prefix narrows a game without restating its endpoint.
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_REMOTE=friendslop LFS_INCLUDE=apps/game FORGEJO_USER=u FORGEJO_TOKEN=t bash "$script" 2>&1)
check "LFS_REMOTE resolves the endpoint" "KBVE/friendslop.git/info/lfs" "$out"
check "LFS_INCLUDE narrows an LFS_REMOTE" "would pull apps/game from" "$out"

# An unknown game is a typo, and has to say so rather than silently pulling
# from the root endpoint, which would 404 every object.
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_REMOTE=nosuchgame bash "$script" 2>&1 || true)
check "unknown LFS_REMOTE is named" "Unknown game 'nosuchgame'" "$out"

# A trailing slash on the prefix must not become a '//' in the pathspec, which
# matches nothing and pulls nothing while exiting 0.
out=$(cd "$d" && LFS_DRY_RUN=1 LFS_INCLUDE=apps/game/ FORGEJO_USER=u FORGEJO_TOKEN=t bash "$script" 2>&1)
check "trailing slash is trimmed" "would pull apps/game from" "$out"
rm -rf "$d"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
