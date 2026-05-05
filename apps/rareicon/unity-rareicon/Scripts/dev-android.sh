#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${HOME}/Downloads/rareicon.apk"
PKG_FALLBACK="com.DefaultCompany.unityrareicon"

err() { printf '\033[31m::ERR::\033[0m %s\n' "$*" >&2; exit 1; }
log() { printf '\033[36m::\033[0m %s\n' "$*"; }

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then
    case "$(uname -s)" in
        Darwin) SDK="${HOME}/Library/Android/sdk" ;;
        Linux)  SDK="${HOME}/Android/Sdk" ;;
    esac
fi
[ -d "$SDK" ] || err "Android SDK not found. Set \$ANDROID_HOME or install via Android Studio (default macOS path: ~/Library/Android/sdk)."

CMDLINE_BIN=""
for cand in "$SDK/cmdline-tools/latest/bin" "$SDK/cmdline-tools/bin" "$SDK/tools/bin"; do
    [ -d "$cand" ] && { CMDLINE_BIN="$cand"; break; }
done

export PATH="$SDK/emulator:$SDK/platform-tools:${CMDLINE_BIN:-$SDK/cmdline-tools/latest/bin}:$PATH"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"

command -v emulator >/dev/null 2>&1 || err "emulator binary missing under $SDK/emulator. Open Android Studio -> SDK Manager -> SDK Tools -> install 'Android Emulator'."
command -v adb      >/dev/null 2>&1 || err "adb missing under $SDK/platform-tools. Install 'Android SDK Platform-Tools' in SDK Manager."

[ -f "$APK_PATH" ] || err "rareicon.apk not found at $APK_PATH. Place a built APK there and re-run."

AVDS="$(emulator -list-avds 2>/dev/null || true)"
[ -n "$AVDS" ] || err "No Android Virtual Devices found. Create one in Android Studio (Tools -> Device Manager) or via 'avdmanager create avd'."

AVD="${1:-$(echo "$AVDS" | head -n1)}"
echo "$AVDS" | grep -qx "$AVD" || err "AVD '$AVD' not in available list:\n$AVDS"

EMU_PID=""
if ! adb devices | awk 'NR>1 && $2=="device" && /^emulator-/' | grep -q .; then
    EMU_LOG="/tmp/rareicon-avd-$$.log"
    log "Booting emulator: $AVD (Vulkan, host GPU). Log: $EMU_LOG"
    "$SDK/emulator/emulator" -avd "$AVD" \
        -gpu host \
        -feature Vulkan \
        -no-snapshot-save \
        -no-boot-anim \
        </dev/null >"$EMU_LOG" 2>&1 &
    EMU_PID=$!
    log "Waiting for adb ..."
    adb wait-for-device
    log "Waiting for boot completion ..."
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
        sleep 2
    done
    log "Emulator ready."
else
    log "Emulator already running, skipping boot."
fi

PKG=""
if command -v aapt >/dev/null 2>&1; then
    PKG="$(aapt dump badging "$APK_PATH" 2>/dev/null | awk -F"'" '/^package: name=/{print $2}' || true)"
fi
if [ -z "$PKG" ] && command -v aapt2 >/dev/null 2>&1; then
    PKG="$(aapt2 dump badging "$APK_PATH" 2>/dev/null | awk -F"'" '/^package: name=/{print $2}' || true)"
fi
[ -n "$PKG" ] || PKG="$PKG_FALLBACK"

log "Installing APK: $APK_PATH (pkg: $PKG)"
INSTALL_OUT="$(adb install -r -g "$APK_PATH" 2>&1 || true)"
if echo "$INSTALL_OUT" | grep -q "INSTALL_FAILED_UPDATE_INCOMPATIBLE\|signatures do not match"; then
    log "Signature mismatch — uninstalling old $PKG and retrying."
    adb uninstall "$PKG" >/dev/null 2>&1 || true
    INSTALL_OUT="$(adb install -g "$APK_PATH" 2>&1 || true)"
fi
echo "$INSTALL_OUT" | grep -q "Success" || err "adb install failed:\n$INSTALL_OUT"

log "Launching package: $PKG"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null

cleanup() {
    log "Stopping emulator (Ctrl+C received)."
    [ -n "$EMU_PID" ] && kill "$EMU_PID" 2>/dev/null || true
    adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
    exit 0
}
trap cleanup INT TERM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-android-$(date +%Y%m%d-%H%M%S).log"

log "Streaming logcat (Unity + AndroidRuntime crashes). Ctrl+C to quit + close emulator."
log "Tee'd to: $LOG_FILE"
adb logcat -c >/dev/null 2>&1 || true
adb logcat -v color -s Unity:V CRASH:V AndroidRuntime:E DEBUG:E | tee -a "$LOG_FILE"
