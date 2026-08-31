#!/usr/bin/env bash
# Exercises clone.sh against a local bare repo standing in for Azure DevOps.
#
# The URL is a filesystem path, so no credential is really used -- what is
# under test is argument assembly and what the clone leaves behind, which is
# where the three copies this replaced differed from each other.
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/clone.sh"
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

# A URL that already carries a scheme would build https://kbve:pat@https://...
out=$(AZURE_REPO_URL=https://dev.azure.com/x/_git/y AZURE_DEST=/tmp/none AZURE_PAT=p bash "$script" 2>&1 || true)
check "a scheme in the URL is rejected" "must have no scheme" "$out"

out=$(AZURE_REPO_URL=dev.azure.com/x/_git/y AZURE_DEST=/tmp/none bash "$script" 2>&1 || true)
check "a missing PAT is named" "AZURE_PAT is not set" "$out"

# The remaining checks need something clonable. git accepts a path where the
# script builds a URL, which exercises everything but the transport.
tmp="$(mktemp -d)"
origin="$tmp/origin"
git init -q --bare "$origin"
work="$tmp/work"
git clone -q "$origin" "$work" 2>/dev/null
git -C "$work" config user.email t@t.t
git -C "$work" config user.name t
printf 'hello\n' > "$work/a.txt"
git -C "$work" add -A
git -C "$work" -c commit.gpgsign=false commit -qm first
git -C "$work" branch -M main
git -C "$work" push -q origin main

# The script builds https://kbve:PAT@$AZURE_REPO_URL, so a bare path here would
# not clone. Point it at the bare repo through a file URL by stubbing git's
# insteadOf, which is how the transport is kept out of the test.
export GIT_CONFIG_GLOBAL="$tmp/gitconfig"
git config --file "$GIT_CONFIG_GLOBAL" "url.$origin.insteadOf" "https://kbve:tok@azure.test/repo"
git config --file "$GIT_CONFIG_GLOBAL" "url.$origin.insteadOf" "https://azure.test/repo" --add

dest="$tmp/dest"
out=$(AZURE_REPO_URL=azure.test/repo AZURE_DEST="$dest" AZURE_PAT=tok bash "$script" 2>&1)
check "clones into the destination" "Cloned azure.test/repo" "$out"
if [ -f "$dest/a.txt" ]; then
	pass=$((pass + 1))
else
	fail=$((fail + 1))
	echo "FAIL: clone produced no working tree"
fi

# The token must not survive in the clone: these runners are self-hosted and
# whatever runs next can read .git/config.
remote=$(git -C "$dest" config --get remote.origin.url)
check "the PAT is stripped from the remote" "https://azure.test/repo" "$remote"
if [[ "$remote" == *tok* ]]; then
	fail=$((fail + 1))
	echo "FAIL: the PAT is still in .git/config"
else
	pass=$((pass + 1))
fi

# A ref is optional, and naming one has to actually select it.
dest2="$tmp/dest2"
out=$(AZURE_REPO_URL=azure.test/repo AZURE_DEST="$dest2" AZURE_REF=main AZURE_DEPTH=1 AZURE_PAT=tok bash "$script" 2>&1)
check "a ref and depth are accepted" "Cloned azure.test/repo" "$out"
branch=$(git -C "$dest2" rev-parse --abbrev-ref HEAD)
check "the named ref is checked out" "main" "$branch"

rm -rf "$tmp"
printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
