#!/usr/bin/env bash
#
# Launch the UE editor with stdout/log streaming and dump diagnostics
# on crash. Designed to be invoked by nx (unreal-chuck:launch-editor)
# from the monorepo root.
#
# Override the UE install via UE_ROOT; defaults to the macOS Epic
# Launcher path. Pass extra args after `--` to forward to UnrealEditor.

set -uo pipefail

PROJ_DIR="apps/chuckrpg/unreal-chuck"
UE_ROOT="${UE_ROOT:-/Users/Shared/Epic Games/UE_5.7}"
UPROJECT="$PROJ_DIR/chuck.uproject"
EDITOR="$UE_ROOT/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"

if [ ! -x "$EDITOR" ]; then
	echo "error: UnrealEditor not found at: $EDITOR" >&2
	echo "       set UE_ROOT to your UE 5.x install root and retry" >&2
	exit 127
fi

if [ ! -f "$UPROJECT" ]; then
	echo "error: chuck.uproject not found at: $UPROJECT" >&2
	echo "       run this from the monorepo root" >&2
	exit 1
fi

ABS_UPROJECT="$(cd "$(dirname "$UPROJECT")" && pwd)/$(basename "$UPROJECT")"

EXISTING_PIDS=$(pgrep -f "UnrealEditor.*chuck.uproject" || true)
if [ -n "$EXISTING_PIDS" ]; then
	echo "==> graceful AppleScript quit: UnrealEditor(chuck) pids=$EXISTING_PIDS"
	osascript -e 'tell application "UnrealEditor" to quit' 2>/dev/null || true

	WAIT=0
	while [ "$WAIT" -lt 30 ] && pgrep -f "UnrealEditor.*chuck.uproject" >/dev/null 2>&1; do
		sleep 1
		WAIT=$((WAIT + 1))
	done

	REMAINING=$(pgrep -f "UnrealEditor.*chuck.uproject" || true)
	if [ -n "$REMAINING" ]; then
		echo "==> SIGINT escalation: $REMAINING"
		for PID in $REMAINING; do
			kill -INT "$PID" 2>/dev/null || true
		done
		WAIT=0
		while [ "$WAIT" -lt 15 ] && pgrep -f "UnrealEditor.*chuck.uproject" >/dev/null 2>&1; do
			sleep 1
			WAIT=$((WAIT + 1))
		done
	fi

	REMAINING=$(pgrep -f "UnrealEditor.*chuck.uproject" || true)
	if [ -n "$REMAINING" ]; then
		echo "==> SIGTERM escalation: $REMAINING"
		for PID in $REMAINING; do
			kill -TERM "$PID" 2>/dev/null || true
		done
		WAIT=0
		while [ "$WAIT" -lt 10 ] && pgrep -f "UnrealEditor.*chuck.uproject" >/dev/null 2>&1; do
			sleep 1
			WAIT=$((WAIT + 1))
		done
	fi

	REMAINING=$(pgrep -f "UnrealEditor.*chuck.uproject" || true)
	if [ -n "$REMAINING" ]; then
		echo "==> SIGKILL last resort: $REMAINING"
		for PID in $REMAINING; do
			kill -KILL "$PID" 2>/dev/null || true
		done
		sleep 1
	fi

	pkill -f "CrashReportClient" 2>/dev/null || true
	pkill -f "EpicWebHelper" 2>/dev/null || true
fi

echo "==> launching UnrealEditor (uproject=$UPROJECT)"
echo "==> log stream:"

"$EDITOR" \
	"$ABS_UPROJECT" \
	-stdout \
	-FullStdOutLogOutput \
	-NoSplash \
	-AbsLog="$PROJ_DIR/Saved/Logs/chuck-stream.log" \
	"$@"

EXIT=$?

if [ "$EXIT" -ne 0 ]; then
	echo ""
	echo "==============================================================="
	echo "  UnrealEditor exited with code $EXIT"
	echo "==============================================================="

	LOG_DIR="$PROJ_DIR/Saved/Logs"
	if [ -d "$LOG_DIR" ]; then
		LATEST_LOG=$(ls -t "$LOG_DIR"/chuck*.log 2>/dev/null | head -1)
		if [ -n "${LATEST_LOG:-}" ]; then
			echo ""
			echo "--- last 80 lines of $LATEST_LOG ---"
			tail -80 "$LATEST_LOG"
		fi
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
