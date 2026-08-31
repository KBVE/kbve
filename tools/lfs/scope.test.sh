#!/usr/bin/env bash
# Exercises scope.sh against the real tree.
#
# Real data rather than fixtures, because what this has to get right is which
# of the eight games' assets actually sit under a given build's source_path --
# a question only the working tree can answer, and the one the hardcoded
# five-game loop it replaced got wrong.
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scope.sh"
root="$(git rev-parse --show-toplevel)"
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

run() {
	(cd "$root" && LFS_DRY_RUN=1 LFS_SCOPE="$1" FORGEJO_USER=u FORGEJO_TOKEN=t bash "$script" 2>&1)
}

# Each game resolves to its own Forgejo repo, not the root endpoint.
out=$(run apps/herbmail)
check "herbmail scope finds herbmail" "KBVE/herbmail.git/info/lfs" "$out"
out=$(run apps/cryptothrone)
check "cryptothrone scope finds cryptothrone" "KBVE/cryptothrone.git/info/lfs" "$out"

# cleanroom and herbmail were absent from the five-game loop this replaced, so
# a build over their trees pulled nothing and shipped pointer stubs.
out=$(run apps/chuckrpg)
check "chuckrpg scope finds cleanroom" "KBVE/cleanroom.git/info/lfs" "$out"

# A scope with no game's assets under it does nothing, rather than pulling the
# whole monorepo's LFS.
out=$(run apps/kbve/edge)
check "unrelated scope pulls nothing" "Resolved LFS for 0 game(s)" "$out"

# A scope inside a game but above nothing tracked is still nothing.
out=$(run packages/npm)
check "packages scope pulls nothing" "Resolved LFS for 0 game(s)" "$out"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
