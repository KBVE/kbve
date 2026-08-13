#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADDON="$(cd "$HERE/.." && pwd)/addons/q"
ROOT="$(cd "$HERE/../../../.." && pwd)"

log() { printf '[gdext.sh] %s\n' "$*" >&2; }

case "$(uname -s)" in
Darwin)
	LIB="$ADDON/macos/libq.dylib"
	TARGET="q:deploy-mac"
	;;
Linux)
	LIB="$ADDON/linux/libq.so"
	TARGET="q:deploy-linux"
	;;
*)
	log "unsupported platform $(uname -s); build the q GDExtension yourself"
	exit 1
	;;
esac

is_built() {
	[ -f "$LIB" ] || return 1
	# An unsmudged LFS pointer is a text stub, not a loadable library.
	! head -c 40 "$LIB" | grep -q '^version https://git-lfs'
}

if [ "${GDEXT_FORCE:-0}" != "1" ] && is_built; then
	exit 0
fi

log "$LIB missing; running nx $TARGET"
cd "$ROOT"
pnpm nx run "$TARGET"

if [ ! -f "$LIB" ]; then
	log "$TARGET finished but $LIB is still absent"
	exit 1
fi
