#!/usr/bin/env bash
#
# Stage the rifle locomotion clips and import them onto Manny's skeleton.
#
# These are Epic's Game Animation Sample rifle set, which is authored on the UE5
# mannequin skeleton: 86 of its 87 bones exist on SKM_Manny_Simple, and the only
# absentee is a helper. So they import directly, with no retargeting, and every
# one of them already holds the weapon -- stance, grip and fingers included.
#
# Only a handful of the 1759 clips are staged. The set below is what the single
# sequence player in UKBVEFootIKAnimInstance can actually use; the strafe sets,
# turn-in-place sets and traversal sets need a graph that can blend them, and
# staging them now would put 2 GB in LFS to be ignored.
#
# Stage one is skipped when the FBX are already staged, so the usual case -- a
# fresh clone with Art/ pulled from LFS -- needs no source. Point ANIM_SRC at the
# unpacked download to restage.

set -uo pipefail

PROJ_DIR="apps/rareicon/unreal-rareicon"
UE_ROOT="${UE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
EDITOR_CMD="$UE_ROOT/Engine/Binaries/Mac/UnrealEditor-Cmd"
ANIM_SRC="${ANIM_SRC:-$HOME/Downloads/GaspFix_rifle_pistol}"
ART="$PROJ_DIR/Art/Animations"

# <asset stem>:<subdirectory>/<source file>
SETS=(
	"A_Rifle_Idle:Idle/M_Neutral_Stand_Idle_Loop_Rifle.FBX"
	"A_Rifle_Walk_F:Walk/M_Neutral_Walk_Loop_F_Rifle.FBX"
	"A_Rifle_Run_F:Run/M_Neutral_Run_Loop_F_Rifle.FBX"
	"A_Rifle_Sprint_F:Sprint/M_Neutral_Sprint_Loop_F_Rifle.FBX"
	"A_Rifle_Jump_Start:Jump/M_Neutral_Jump_F_Start_Stand_Rfoot_Rifle.FBX"
	"A_Rifle_Jump_Land:Jump/M_Neutral_Jump_F_Land_Stand_Light_Rfoot_Rifle.FBX"
)

if [ ! -f "$PROJ_DIR/RareIcon.uproject" ]; then
	echo "error: run this from the monorepo root" >&2
	exit 1
fi

mkdir -p "$ART"

needs_stage=0
for entry in "${SETS[@]}"; do
	IFS=: read -r stem _rel <<<"$entry"
	[ -f "$ART/${stem}.fbx" ] || needs_stage=1
done

if [ "$needs_stage" = "1" ]; then
	if [ ! -d "$ANIM_SRC/_FixedRifle" ]; then
		echo "error: animation source not found at: $ANIM_SRC/_FixedRifle" >&2
		echo "       either 'git lfs pull' Art/Animations or set ANIM_SRC" >&2
		exit 127
	fi
	echo "staging rifle clips from $ANIM_SRC"
	for entry in "${SETS[@]}"; do
		IFS=: read -r stem rel <<<"$entry"
		src="$ANIM_SRC/_FixedRifle/$rel"
		if [ ! -f "$src" ]; then
			echo "error: source clip not found: $src" >&2
			exit 1
		fi
		cp "$src" "$ART/${stem}.fbx" || exit 1
		echo "  $stem <- $rel"
	done
else
	echo "clips already staged, skipping"
fi

if [ ! -x "$EDITOR_CMD" ]; then
	echo "error: UnrealEditor-Cmd not found at: $EDITOR_CMD" >&2
	exit 127
fi

ABS_UPROJECT="$(cd "$PROJ_DIR" && pwd)/RareIcon.uproject"
ABS_SCRIPT="$(cd "$PROJ_DIR/scripts" && pwd)/import_animations.py"

echo "importing into the project"
"$EDITOR_CMD" "$ABS_UPROJECT" -run=pythonscript -script="$ABS_SCRIPT" \
	-unattended -nosplash -nosound 2>&1 \
	| grep -E "LogPython: (Display|Warning|Error)|LogPythonScriptCommandlet|: (Error|Fatal): " \
	| grep -v "LogInit: Display:"
STATUS=${PIPESTATUS[0]}

if [ "$STATUS" != "0" ]; then
	echo "error: import failed (exit $STATUS)" >&2
	exit "$STATUS"
fi
echo "animation import complete"
