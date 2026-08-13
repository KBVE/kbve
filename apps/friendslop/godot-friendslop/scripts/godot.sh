#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="${GODOT_VERSION:-4.7.1}"
GODOT_CACHE="${GODOT_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/kbve/godot}"

log() { printf '[godot.sh] %s\n' "$*" >&2; }

usable() {
	[ -n "${1:-}" ] && [ -x "$1" ] && "$1" --version >/dev/null 2>&1
}

find_existing() {
	if usable "${GODOT_BIN:-}"; then
		printf '%s' "$GODOT_BIN"
		return 0
	fi

	local hit
	hit="$(command -v godot 2>/dev/null || true)"
	if usable "$hit"; then
		printf '%s' "$hit"
		return 0
	fi

	local candidate
	for candidate in \
		"$GODOT_CACHE/$GODOT_VERSION/godot" \
		"/Applications/Godot.app/Contents/MacOS/Godot" \
		"$HOME/Applications/Godot.app/Contents/MacOS/Godot" \
		"/usr/local/bin/godot" \
		"/opt/homebrew/bin/godot"; do
		if usable "$candidate"; then
			printf '%s' "$candidate"
			return 0
		fi
	done

	return 1
}

asset_name() {
	case "$(uname -s)" in
	Darwin) printf 'Godot_v%s-stable_macos.universal.zip' "$GODOT_VERSION" ;;
	Linux)
		case "$(uname -m)" in
		aarch64 | arm64) printf 'Godot_v%s-stable_linux.arm64.zip' "$GODOT_VERSION" ;;
		*) printf 'Godot_v%s-stable_linux.x86_64.zip' "$GODOT_VERSION" ;;
		esac
		;;
	*)
		log "unsupported platform $(uname -s); set GODOT_BIN to a Godot $GODOT_VERSION binary"
		return 1
		;;
	esac
}

install_godot() {
	if [ "${GODOT_NO_INSTALL:-0}" = "1" ]; then
		log "godot $GODOT_VERSION not found and GODOT_NO_INSTALL=1; set GODOT_BIN or install it"
		return 1
	fi

	local asset url dest tmp
	asset="$(asset_name)"
	url="https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}-stable/${asset}"
	dest="$GODOT_CACHE/$GODOT_VERSION"
	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' RETURN

	log "godot $GODOT_VERSION not found; downloading $asset"
	mkdir -p "$dest"
	if ! curl -fsSL --retry 3 -o "$tmp/godot.zip" "$url"; then
		log "download failed: $url"
		return 1
	fi
	unzip -q -o "$tmp/godot.zip" -d "$tmp/x"

	local bin
	bin="$(find "$tmp/x" -type f \( -name 'Godot' -o -name 'Godot_v*' \) -perm -u+x | head -n 1)"
	if [ -z "$bin" ]; then
		log "no Godot binary inside $asset"
		return 1
	fi

	if [ "$(uname -s)" = "Darwin" ]; then
		rm -rf "$dest/Godot.app"
		cp -R "$(cd "$(dirname "$bin")/../.." && pwd)" "$dest/Godot.app"
		ln -sf "$dest/Godot.app/Contents/MacOS/Godot" "$dest/godot"
		xattr -dr com.apple.quarantine "$dest/Godot.app" 2>/dev/null || true
	else
		cp "$bin" "$dest/godot"
		chmod +x "$dest/godot"
	fi

	printf '%s' "$dest/godot"
}

resolve() {
	local bin
	if bin="$(find_existing)"; then
		printf '%s' "$bin"
		return 0
	fi
	bin="$(install_godot)" || return 1
	usable "$bin" || {
		log "installed binary not runnable: $bin"
		return 1
	}
	printf '%s' "$bin"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
	bin="$(resolve)"
	if [ "${1:-}" = "--which" ]; then
		printf '%s\n' "$bin"
		exit 0
	fi
	exec "$bin" "$@"
fi
