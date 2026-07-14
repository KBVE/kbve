#!/usr/bin/env bash
# Rebake character-anim.glb from the SIDEKICK target + Mesh2Motion source using
# the shared kbve.blender Rokoko retarget. Run from anywhere.
#
#   ./art/character/rebake.sh
#
# To add clips: append their action names to CLIPS below. Needs the Rokoko
# addon in the Blender that kbve.blender launches (rokoko_beta on Blender 5.0.x).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS="$(cd "$HERE/../../public/models" && pwd)"
KBVE_PY="$(cd "$HERE/../../../../../packages/python/kbve" && pwd)"

CLIPS="Idle_Loop,Walk_Loop,Jog_Fwd_Loop,Sprint_Loop,Sword_Idle,Sword_Attack,Sword_Block,Jump_Start,Jump_Loop,Jump_Land,Punch_Cross"

cd "$KBVE_PY"
uv run kbve-blender-retarget \
  --char  "$MODELS/character.glb" \
  --anims "$MODELS/m2m-character.glb" \
  --out   "$MODELS/character-anim.glb" \
  --clips "$CLIPS"
