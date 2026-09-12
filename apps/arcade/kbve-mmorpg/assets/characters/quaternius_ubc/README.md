# Quaternius Ultimate Base Characters

CC0. Source: https://quaternius.com/

Copied from `apps/friendslop/godot-friendslop/assets/characters/quaternius_ubc`
rather than shared, because LFS blobs are routed by path prefix
(`tools/lfs/remotes.tsv`) and friendslop's prefix does not cover `apps/arcade`.
Forgejo dedups content across the KBVE org, so the same OIDs are registered
against a second repo rather than stored twice.

Godot's `.import` sidecars and `quaternius_bone_map.tres` were left behind —
they describe Godot's humanoid retarget profile, which bevy has no use for.

## Skeleton

65 joints, Unreal Engine 5 mannequin naming. The same triples address a limb in
every engine lane here:

| limb      | root         | mid          | tip      |
| --------- | ------------ | ------------ | -------- |
| left leg  | `thigh_l`    | `calf_l`     | `foot_l` |
| right leg | `thigh_r`    | `calf_r`     | `foot_r` |
| left arm  | `upperarm_l` | `lowerarm_l` | `hand_l` |
| right arm | `upperarm_r` | `lowerarm_r` | `hand_r` |

Each is a direct parent→child chain, which is what `kinetree::IkLimbBones`
requires.

There are **no twist bones**. A rig with `lowerarm_twist_01` can spread an
authored wrist roll down the forearm; this one cannot, so extreme roll shears
the skin. 30 of the 65 joints are fingers — a crowd LOD should stop at `hand_*`.

## Contents

- `models/` — 8 base bodies (Regular/Teen × Male/Female × FullBody/OnlyHead),
  64 modular outfit pieces under `outfits/`, hair under `hair/`.
- `animations/` — `UAL1.glb` (120 clips) and `UAL2.glb` (134 clips), both
  keyed against the same 65-joint skeleton.

## Not copied

`textures/` is 202MB of 4K PNGs — one ORM map alone is 15MB. It needs a KTX2
conversion pass before it is usable in either lane, and nothing about the
skeleton or the IK needs it.
