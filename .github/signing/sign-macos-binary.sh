#!/usr/bin/env bash
# Sign a macOS Mach-O or bundle in place.
#
# With no identity this is an ad-hoc signature, which is all a local build needs:
# cargo's linker-signed signature is rejected by dyld on Apple Silicon
# (Termination Reason: CODESIGNING, Invalid Page).
#
# With an identity it is a Developer ID signature carrying a secure timestamp and
# the hardened runtime, which is what notarization requires and what ad-hoc can
# never provide. Signing must happen at the final destination — copying a signed
# binary elsewhere invalidates the signature.
set -euo pipefail

target="${1:?usage: sign-macos-binary.sh <path> [identity] [entitlements]}"
identity="${2:-}"
entitlements="${3:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
	exit 0
fi

if [[ ! -e "$target" ]]; then
	echo "sign-macos-binary: no such path: $target" >&2
	exit 1
fi

xattr -cr "$target"
# Only for loose Mach-O: stripping a bundle's signature also strips the seal over
# its nested code, and --force replaces it anyway.
if [[ -f "$target" ]]; then
	codesign --remove-signature "$target" 2>/dev/null || true
fi

args=(--force)
if [[ -n "$identity" ]]; then
	args+=(--sign "$identity" --timestamp --options runtime)
	if [[ -n "$entitlements" ]]; then
		args+=(--entitlements "$entitlements")
	fi
else
	args+=(--sign -)
fi

codesign "${args[@]}" "$target"
codesign --verify --strict "$target"

flags="$(codesign -dv "$target" 2>&1 | sed -n 's/.*flags=\([^ ]*\).*/\1/p')"
case "$flags" in
*linker-signed*)
	echo "sign-macos-binary: $target still linker-signed ($flags); dyld will reject it" >&2
	exit 1
	;;
esac

if [[ -n "$identity" ]]; then
	# A Developer ID signature that did not get a timestamp is notarization-rejected
	# later, in a log that does not name the cause clearly. Catch it here instead.
	if ! codesign -dvv "$target" 2>&1 | grep -q '^Timestamp='; then
		echo "sign-macos-binary: $target has no secure timestamp; notarization will reject it" >&2
		exit 1
	fi
fi

echo "sign-macos-binary: $target signed (${identity:-ad-hoc}) flags=$flags"
