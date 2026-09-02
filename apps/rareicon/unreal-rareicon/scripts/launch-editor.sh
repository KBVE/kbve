#!/usr/bin/env bash
#
# Launch the UE editor with stdout/log streaming and dump diagnostics
# on crash. Designed to be invoked by moon (unreal-rareicon:launch-editor)
# from the monorepo root.
#
# Override the UE install via UE_ROOT; defaults to the macOS Epic
# Launcher path. Pass extra args after `--` to forward to UnrealEditor.

set -uo pipefail

PROJ_DIR="apps/rareicon/unreal-rareicon"
UE_ROOT="${UE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
UPROJECT="$PROJ_DIR/RareIcon.uproject"
EDITOR="$UE_ROOT/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"

if [ ! -x "$EDITOR" ]; then
	echo "error: UnrealEditor not found at: $EDITOR" >&2
	echo "       set UE_ROOT to your UE 5.x install root and retry" >&2
	exit 127
fi

if [ ! -f "$UPROJECT" ]; then
	echo "error: RareIcon.uproject not found at: $UPROJECT" >&2
	echo "       run this from the monorepo root" >&2
	exit 1
fi

ABS_UPROJECT="$(cd "$(dirname "$UPROJECT")" && pwd)/$(basename "$UPROJECT")"

# The editor loads libUnrealEditor-RareIcon.dylib at startup; a stale or
# missing one is a startup crash, not a compile error, so fail here with
# something readable instead.
# UE emits the module as either UnrealEditor-RareIcon.dylib or
# libUnrealEditor-RareIcon.dylib depending on how it links, so accept both.
if ! compgen -G "$PROJ_DIR/Binaries/Mac/*UnrealEditor-RareIcon.dylib" >/dev/null; then
	echo "error: game module not built in $PROJ_DIR/Binaries/Mac" >&2
	echo "       run: moon run unreal-rareicon:build-editor" >&2
	exit 1
fi

"$PROJ_DIR/scripts/quit-editor.sh" "$PROJ_DIR" || exit 1

LOG_DIR="$(cd "$PROJ_DIR" && pwd)/Saved/Logs"
mkdir -p "$LOG_DIR"
RAW_LOG="$LOG_DIR/rareicon-stream.log"
FRIENDLY_LOG="$LOG_DIR/rareicon.log"
ISSUE_LOG="$LOG_DIR/rareicon-issues.log"
# UE's own log gets its own path: pointing -AbsLog at RAW_LOG had the engine
# and tee writing the same file through two handles, which interleaves.
UE_LOG="$LOG_DIR/rareicon-ue.log"
: > "$FRIENDLY_LOG"
: > "$ISSUE_LOG"

# UE severities are a field, not a word: 'LogFoo: Warning: msg'. Matching the
# bare words instead caught every line that merely said "error" -- which is why
# a clean run still printed a wall of hits.
ISSUE_RE=': (Error|Warning|Fatal): |Assertion failed|ensure condition failed|Caught signal|LogOutputDevice: Error'

echo "==> launching UnrealEditor (uproject=$UPROJECT)"
echo "==> raw stream : $RAW_LOG"
echo "==> engine log : $UE_LOG"
echo "==> issues     : $ISSUE_LOG"
echo "==> friendly   : $FRIENDLY_LOG"
echo "==> filtered console (LogRareIcon, LogKBVE*, warnings, errors) below:"
echo ""

( for _ in $(seq 1 15); do
	sleep 2
	osascript -e 'tell application "System Events" to set frontmost of (first process whose name contains "UnrealEditor") to true' 2>/dev/null && break
done ) &

"$EDITOR" \
	"$ABS_UPROJECT" \
	-stdout \
	-FullStdOutLogOutput \
	-AbsLog="$UE_LOG" \
	"$@" 2>&1 \
	| tee "$RAW_LOG" \
	| grep --line-buffered -E "LogRareIcon|LogKBVE|Engine exit requested|$ISSUE_RE" \
	| tee "$FRIENDLY_LOG"

EXIT=${PIPESTATUS[0]}

# Extracted after exit rather than teed through a process substitution during
# the run: no flush race, and it still works when the editor is killed hard.
grep -E "$ISSUE_RE" "$RAW_LOG" > "$ISSUE_LOG" 2>/dev/null || true
WARN_COUNT=$(grep -cE ': Warning: ' "$ISSUE_LOG" 2>/dev/null || echo 0)
ERR_COUNT=$(grep -cE ': (Error|Fatal): |Assertion failed|ensure condition failed|Caught signal|LogOutputDevice: Error' "$ISSUE_LOG" 2>/dev/null || echo 0)
echo ""
echo "==> $ERR_COUNT error(s), $WARN_COUNT warning(s) -> $ISSUE_LOG"

if [ "$EXIT" -ne 0 ]; then
	echo ""
	echo "==============================================================="
	echo "  UnrealEditor exited with code $EXIT"
	echo "==============================================================="

	if [ -s "$ISSUE_LOG" ]; then
		echo ""
		echo "--- warnings + errors ($ERR_COUNT error(s), $WARN_COUNT warning(s)) ---"
		cat "$ISSUE_LOG"
	fi

	if [ -f "$UE_LOG" ]; then
		echo ""
		echo "--- last 80 lines of $UE_LOG ---"
		tail -80 "$UE_LOG"
	fi

	CRASH_DIR="$PROJ_DIR/Saved/Crashes"
	if [ -d "$CRASH_DIR" ]; then
		LATEST_CRASH=$(find "$CRASH_DIR" -maxdepth 1 -type d -name "UECC-*" 2>/dev/null | sort | tail -1)
		if [ -n "${LATEST_CRASH:-}" ]; then
			echo ""
			echo "--- latest crash dump: $LATEST_CRASH ---"
			if [ -f "$LATEST_CRASH/Diagnostics.txt" ]; then
				cat "$LATEST_CRASH/Diagnostics.txt"
			else
				ls -la "$LATEST_CRASH" 2>/dev/null
			fi
		fi
	fi

	echo ""
	echo "==============================================================="
fi

exit "$EXIT"
