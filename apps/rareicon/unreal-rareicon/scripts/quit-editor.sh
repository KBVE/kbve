#!/usr/bin/env bash
#
# Quit any running RareIcon editor, escalating if it will not go.
#
# Separate from launching because the order matters: UnrealBuildTool cannot
# replace a dylib the running editor has loaded, so it writes a numbered
# hot-reload copy instead (libUnrealEditor-Foo-0003.dylib) and leaves the real
# one untouched. Build first and quit second -- which is what a moon task dep
# does -- and the editor then starts against a module that is silently stale,
# with no error anywhere to say so.

set -uo pipefail

PROJ_DIR="${1:-apps/rareicon/unreal-rareicon}"
MATCH="UnrealEditor.*RareIcon.uproject"

EXISTING_PIDS=$(pgrep -f "$MATCH" || true)
if [ -z "$EXISTING_PIDS" ]; then
	exit 0
fi

echo "==> graceful AppleScript quit: UnrealEditor(RareIcon) pids=$EXISTING_PIDS"
osascript -e 'tell application "UnrealEditor" to quit' 2>/dev/null || true

WAIT=0
while [ "$WAIT" -lt 30 ] && pgrep -f "$MATCH" >/dev/null 2>&1; do
	sleep 1
	WAIT=$((WAIT + 1))
done

for SIG in INT TERM KILL; do
	REMAINING=$(pgrep -f "$MATCH" || true)
	[ -z "$REMAINING" ] && break
	echo "==> SIG$SIG escalation: $REMAINING"
	for PID in $REMAINING; do
		kill -"$SIG" "$PID" 2>/dev/null || true
	done
	WAIT=0
	while [ "$WAIT" -lt 10 ] && pgrep -f "$MATCH" >/dev/null 2>&1; do
		sleep 1
		WAIT=$((WAIT + 1))
	done
done

pkill -f "CrashReportClient" 2>/dev/null || true
pkill -f "EpicWebHelper" 2>/dev/null || true

# Hot-reload copies from any build that ran against a live editor. Leaving them
# is harmless at runtime but they accumulate, and their presence is the symptom
# that says a build went somewhere other than the module the editor loads.
STALE=$(find "$PROJ_DIR/Binaries/Mac" -name '*-[0-9][0-9][0-9][0-9].dylib' 2>/dev/null || true)
if [ -n "$STALE" ]; then
	echo "==> removing $(echo "$STALE" | wc -l | tr -d ' ') hot-reload dylibs"
	echo "$STALE" | while read -r F; do rm -f "$F"; done
fi
