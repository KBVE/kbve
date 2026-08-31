#!/usr/bin/env bash
# Exercises the CI face of the blender tools.
#
# The bpy work itself cannot be tested without Blender and a .blend, so what is
# covered here is the wrapper's contract: that it rejects an unknown operation
# rather than composing a console-script name that does not exist, and that
# every operation it claims to support is actually declared by the package.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$here/blender.sh"
pyproject="$here/../../packages/python/kbve/pyproject.toml"
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

out=$(bash "$script" 2>&1 || true)
check "no operation is a usage error" "usage: blender.sh" "$out"

out=$(bash "$script" nosuchtool 2>&1 || true)
check "an unknown operation is named" "Unknown blender tool 'nosuchtool'" "$out"

# The wrapper builds a console-script name by prefixing the operation. If the
# package stops declaring one, the wrapper would fail at "command not found"
# after a uv sync rather than saying what is actually missing.
for op in which render export batch-export retarget vat; do
	if grep -q "^kbve-blender-$op = " "$pyproject"; then
		pass=$((pass + 1))
	else
		fail=$((fail + 1))
		echo "FAIL: the package declares no kbve-blender-$op console script"
	fi
done

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
