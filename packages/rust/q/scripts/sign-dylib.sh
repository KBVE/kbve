#!/usr/bin/env bash
# Ad-hoc re-sign a macOS dylib in place.
# Cargo's linker-signed signature is rejected by dyld on Apple Silicon
# (Termination Reason: CODESIGNING, Invalid Page). Signing must happen at the
# final destination — copying a signed dylib elsewhere invalidates it.
set -euo pipefail

target="${1:?usage: sign-dylib.sh <path-to-dylib>}"

if [[ "$(uname -s)" != "Darwin" ]]; then
	exit 0
fi

if [[ ! -f "$target" ]]; then
	echo "sign-dylib: no such file: $target" >&2
	exit 1
fi

xattr -cr "$target"
codesign --remove-signature "$target" 2>/dev/null || true
codesign --force --sign - "$target"
codesign --verify --strict "$target"

flags="$(codesign -dv "$target" 2>&1 | sed -n 's/.*flags=\([^ ]*\).*/\1/p')"
case "$flags" in
	*linker-signed*)
		echo "sign-dylib: $target still linker-signed ($flags); dyld will reject it" >&2
		exit 1
		;;
esac
echo "sign-dylib: $target signed ($flags)"
