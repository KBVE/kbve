#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$HERE/gdext.sh"
GODOT_BIN="$(bash "$HERE/godot.sh" --which)"
"$GODOT_BIN" --headless --import
"$GODOT_BIN" --headless -d -s res://addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode -a res://tests -c
