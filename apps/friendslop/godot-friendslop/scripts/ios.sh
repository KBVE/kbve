#!/usr/bin/env bash
# iOS export/install/run helper.
#
# The signing team is never committed: export_presets.cfg ships with an empty
# app_store_team_id, this injects the local one for the duration of the export
# and restores the placeholder afterwards. Set IOS_TEAM_ID to override the
# autodetected value; set IOS_DEVICE_ID to pin a specific device.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRESET="${PROJECT_DIR}/export_presets.cfg"
IPA="${PROJECT_DIR}/../../../dist/apps/friendslop/ios/friendslop.ipa"
GODOT="${GODOT_BIN:-godot}"
BUNDLE_ID="com.kbve.friendslop"

die() { echo "ios.sh: $*" >&2; exit 1; }

team_id() {
	if [[ -n "${IOS_TEAM_ID:-}" ]]; then
		echo "${IOS_TEAM_ID}"
		return
	fi
	# Read TeamIdentifier out of an installed provisioning profile. The
	# parenthesised suffix on an "Apple Development" identity is a per-cert id,
	# not the team, so it cannot be used here. Only the team id is captured,
	# never the identity's owner name.
	local profile
	for profile in "${HOME}/Library/Developer/Xcode/UserData/Provisioning Profiles/"*.mobileprovision; do
		[[ -f "${profile}" ]] || continue
		security cms -D -i "${profile}" 2>/dev/null \
			| plutil -extract TeamIdentifier.0 raw -o - - 2>/dev/null && return
	done
}

device_id() {
	if [[ -n "${IOS_DEVICE_ID:-}" ]]; then
		echo "${IOS_DEVICE_ID}"
		return
	fi
	# Model names contain spaces, so the identifier is matched by shape rather
	# than by column position.
	xcrun devicectl list devices 2>/dev/null \
		| grep -E 'available' \
		| grep -oE '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}' \
		| head -1
}

restore_preset() {
	if [[ -f "${PRESET}.bak" ]]; then
		mv "${PRESET}.bak" "${PRESET}"
	fi
}

cmd_export() {
	local team
	team="$(team_id)"
	[[ -n "${team}" ]] || die "no signing team found; set IOS_TEAM_ID"

	mkdir -p "$(dirname "${IPA}")"
	cp "${PRESET}" "${PRESET}.bak"
	trap restore_preset EXIT
	sed -i '' "s|^application/app_store_team_id=.*|application/app_store_team_id=\"${team}\"|" "${PRESET}"

	"${GODOT}" --headless --path "${PROJECT_DIR}" --export-debug "iOS" "${IPA}"
}

cmd_install() {
	local device
	device="$(device_id)"
	[[ -n "${device}" ]] || die "no paired device found; set IOS_DEVICE_ID"
	[[ -f "${IPA}" ]] || die "missing ${IPA}; run export first"
	xcrun devicectl device install app --device "${device}" "${IPA}"
}

cmd_run() {
	local device
	device="$(device_id)"
	[[ -n "${device}" ]] || die "no paired device found; set IOS_DEVICE_ID"
	xcrun devicectl device process launch \
		--device "${device}" --console --terminate-existing "${BUNDLE_ID}"
}

case "${1:-}" in
	export) cmd_export ;;
	install) cmd_install ;;
	run) cmd_run ;;
	*) die "usage: ios.sh {export|install|run}" ;;
esac
