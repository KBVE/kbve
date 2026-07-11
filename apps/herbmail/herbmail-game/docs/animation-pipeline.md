# Herbmail Game — Character Animation Pipeline

Full-body character animation system for the PSX-style R3F / three.js dungeon crawler.

## Overview

The system is a **hybrid animation architecture** combining three layers:

1. **Baked skeletal clips** (glTF) — authored/retargeted animation Actions exported into the character glb.
2. **Runtime blending / additive** (three.js `AnimationMixer`) — crossfades, phase-synced locomotion blends, and additive overlays.
3. **Procedural bone passes** — code-driven bone overrides (e.g. head look-at) applied after the mixer.

Two asset sources feed the rig:

- **Character mesh** comes from **Synty SIDEKICK** (modular, ~101 species + 60 outfit parts).
- **Animation clips** come from **Mesh2Motion** (~88 clips).

Both use a **UE-mannequin-style skeleton with matching bone names**, which is precisely why they can be combined. Matching names, however, is _not_ enough on its own — see [The Retarget Problem](#3-the-retarget-problem).

## Pipeline Diagram

```
  SYNTY SIDEKICK                          MESH2MOTION
  (modular part FBX,                      (human-base-animations.glb,
   88-bone UE rig, T-pose)                 88 clips, A-pose rest)
        │                                        │
        │ assemble_sidekick.py                   │
        │ (Blender headless)                     │
        ▼                                        │
   character.glb                                 │
   (T-pose, 88 bones,                            │
    2 materials, ~1.9MB)                         │
        │                                        │
        └──────────────┬─────────────────────────┘
                       │
                       ▼
            ROKOKO GUI RETARGET (Blender, manual)
            source A-pose motion → target T-pose SIDEKICK rig
                       │
                       ▼
            character.glb  (SIDEKICK rig + baked Actions)
                       │
                       ▼
       three.js runtime (src/game/character/)
       AnimationMixer + Motor + ProceduralPose
```

---

## 1. Character Mesh (Synty SIDEKICK)

### Source package

- Package: `~/Downloads/SIDEKICK_Starter_Unity_2021_3_v1_0_4.unitypackage`
- Despite the `.unitypackage` extension it is a **gzipped tar**. Extract with:

    ```bash
    tar xzf SIDEKICK_Starter_Unity_2021_3_v1_0_4.unitypackage
    ```

- Each asset directory inside contains a `pathname` file naming the real asset — use it to resolve which extracted blob is which FBX/texture.

### Modularity

- ~101 species + 60 outfit part-FBX.
- **Every part FBX carries the FULL 88-bone UE-mannequin skeleton.** Bones include:
  `root`, `pelvis`, `spine_01/02/03`, `neck_01`, `head`, `clavicle_l`, `upperarm_l`, `lowerarm_l`, `hand_l` + fingers (`index/middle/ring/pinky/thumb_01..03_l`), twist bones, **`prop_l` / `prop_r`** (weapon-socket bones), `thigh_l`, `calf_l`, `foot_l`, `ball_l` — plus the `_r` mirror of each.

### Part slots

Parts are numbered by body slot:

| Slot                | Region          |
| ------------------- | --------------- |
| `10TORS`            | Torso           |
| `11AUPL` / `12AUPR` | Upper arm L / R |
| `13ALW` / `14ALW`   | Lower arm L / R |
| `15HND` / `16HND`   | Hand L / R      |
| `17HIPS`            | Hips            |
| `18LEG` / `19LEG`   | Leg L / R       |
| `20FOT` / `21FOT`   | Foot L / R      |

A knight outfit (`FANT_KNGT_17`) replaces those slots with armor and adds extra pieces `22AHED..34AKNR` (helmet / shoulders / hips / knees).

> **A complete knight** = `FANT_KNGT_17` parts **10–34** + base **head / eyes / nose**.

### Assembly script

`art/character/assemble_sidekick.py` (Blender headless):

1. Imports all chosen part FBX.
2. Retargets each mesh's `Armature` modifier to **ONE master armature** and reparents.
3. Joins the meshes.
4. Exports the glb.

### Assembly gotchas (IMPORTANT)

1. **Duplicate materials.** Parts import ~30 duplicate materials. Fix: assign **2 shared materials** by part origin:
    - `T_Starter_01ColorMap.png` → armor / outfit
    - `T_HumanSpecies_01ColorMap.png` → skin / head
    - Use texture interpolation **`'Closest'`** for the PSX look.
2. **Blendshape bloat.** SIDEKICK parts carry face/body blendshapes (morph targets) that bloat the glb from **~1.8MB → 21MB** (317 accessors). Export with **`export_morph=False`**.
3. **Blender 5.0 render engine enum** is **`'BLENDER_EEVEE'`** — _not_ `'BLENDER_EEVEE_NEXT'`.

### Output

`apps/herbmail/herbmail-game/public/models/character.glb`

- ~1.9MB, T-pose, 88-bone rig, 2 materials.

---

## 2. Animation Clips (Mesh2Motion)

### Source

- Repo: `github.com/Mesh2Motion/mesh2motion-app`
- Clip file: `static/animations/human-base-animations.glb`
- Raw URL:
  `https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/main/static/animations/human-base-animations.glb`

### Clips

Uses the **same UE bone names** as SIDEKICK. ~88 clips, including:

```
Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Sprint_Loop,
Sword_Idle, Sword_Attack, Sword_Block, Sword_Regular_A/B/C,
Hit_Head, Hit_Knockback, Death_D, Roll,
Idle_Torch_Loop, Spell_*, Pistol_*, Punch_*
```

> Clips with the **`_RM` suffix** are **root-motion** variants — **skip them** for in-place locomotion.

### Placeholder mesh (zero-retarget)

- Mesh2Motion's own human mesh: `static/models-variation/human-base.glb` (66-bone rig, has fingers).
- Its **mesh + its clips share a rig**, so they combine with **ZERO retarget**. This is used as a working placeholder to build and verify the runtime code before the real SIDEKICK retarget is done.
- Current in-repo placeholder: `public/models/m2m-character.glb` (~5.7MB, all 88 clips).

---

## 3. The Retarget Problem

This is the crux of the pipeline.

- Mesh2Motion clips are authored for an **A-pose rest** (arms down).
- SIDEKICK binds in **T-pose** (arms out).
- Matching bone **names is not enough** — bone **local axis / roll** and **rest pose** differ.

### What was tried (and failed) headless

| Attempt                             | Result                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Naive action assignment         | Arms stuck in T-pose                                                                                                                                                                |
| (b) Delta-from-rest matrix retarget | Same — arms stuck in T                                                                                                                                                              |
| (c) A-pose rebind of the mesh       | Mesh explodes                                                                                                                                                                       |
| (d) Rokoko Blender addon headless   | Addon _loads_ headless, but its `rsl.*` retargeting operators **do NOT register** in Blender 5.0 headless — the addon pulls streaming deps (`lz4`, `boto3`) that break registration |

**Conclusion:** the retarget is a **Blender GUI task**. Rokoko Studio Live (free) or Auto-Rig Pro handle T↔A retargeting correctly in the GUI.

`art/character/retarget_m2m.py` holds the (failed) headless delta attempt **for reference only**.

> **UPDATE (2026-07-10): headless Rokoko retarget WORKS now.** On Blender 5.0.1 the `rsl.*` operators DO register — `rokoko_stable` fails (`No module named 'gql'`) but **`rokoko_beta` enables clean** and exposes `rsl.build_bone_list` + `rsl.retarget_animation`. `art/character/retarget_rokoko.py` runs the full pipeline headless (target `character.glb` + source `m2m-character.glb` → `character-anim.glb`, 11/11 clips). Run it **from `art/character/`** (it uses a `__file__`-relative models path; a `/tmp` copy resolves wrong and errors "Please select a file"). Use this to ADD clips — but see below: a re-retarget does **not** fix foot float.

> **IMPORTANT:** the SIDEKICK **88-bone skeleton is KEPT entirely** through retargeting. Retargeting only copies **motion** onto it — **fingers and `prop_l` / `prop_r` weapon sockets remain intact.**

### Rokoko GUI Retarget — step by step

1. **Install the addon.** Get the free "Rokoko Studio Live for Blender" addon (`github.com/Rokoko/rokoko-studio-live-blender`) via **Blender Preferences > Add-ons > Install**, using the **GUI** (not headless).
2. **Import the target rig.** Open Blender GUI. `File > Import > glTF 2.0 > public/models/character.glb`. This is the **TARGET** rig (T-pose).
3. **Import the source clips.** Import the Mesh2Motion animations glb (`human-base-animations.glb`). This brings the **SOURCE** armature (A-pose) plus all clips as **Actions**.
4. **Set armatures.** In the Rokoko sidebar (N-panel) > **Retargeting**: set **Source Armature** = the Mesh2Motion armature, **Target Armature** = the SIDEKICK armature.
5. **Build Bone List.** Click **"Build Bone List"** — because bone names match, it **auto-maps**. Verify the mapping (`root`, `pelvis`, `spine_01..03`, `upperarm_l/r`, etc.).
6. **Retarget per clip.** For each clip you want: select that Action on the source armature (**Dope Sheet > Action Editor**), then click **"Retarget Animation"**. Rokoko bakes a **new Action** onto the SIDEKICK armature. **Rename** it to match the clip (e.g. `Idle_Loop`).
7. **Repeat** for the desired clip set. Start minimal:
    ```
    Idle_Loop, Walk_Loop, Jog_Fwd_Loop,
    Sword_Idle, Sword_Attack, Sword_Block,
    Hit_Head, Death_D, Roll, Idle_Torch_Loop
    ```
8. **Clean up and export.** Delete the Mesh2Motion source armature. `File > Export > glTF 2.0`, selecting the **SIDEKICK armature + mesh**, with **"Animation" enabled**, mode = **Actions**, and **Morph OFF**. **Overwrite `public/models/character.glb`.**
9. **Switch the code.** Change the `ThirdPersonPlayer` url from `/models/m2m-character.glb` to `/models/character.glb`.

---

## 4. Runtime Code / Module API

All modules live in `src/game/character/` and are designed to be reusable.

### CharacterAnimator.ts

Wraps `THREE.AnimationMixer`.

| Method                                | Behavior                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `play(name, {fade, loop, timeScale})` | Crossfades the **base locomotion / stance layer**.                                                         |
| `playOnce(name, fade)`                | Plays a **one-shot** and returns a **Promise** resolving on the mixer `'finished'` event.                  |
| `blend(a, b, alpha)`                  | **Phase-synced** walk↔run blend — normalizes `action.time` by clip duration so feet don't pop.             |
| `registerAdditive(name)`              | Registers an **additive** clip via `THREE.AnimationUtils.makeClipAdditive` + `AdditiveAnimationBlendMode`. |
| `pulseAdditive(name, weight)`         | Fires an additive overlay (recoil / flinch).                                                               |
| `update(dt)`                          | Calls `mixer.update`.                                                                                      |
| `has(name)`                           | Checks whether a clip is available (used when adding clips).                                               |

### CharacterMotor.ts

Authoritative **planar movement**. **Movement drives animation, never the reverse.**

- `setDesiredVelocity(x, z)`
- `update(dt)` — integrates position, faces the travel direction.
- Exposes **gait** (`'idle' | 'walk' | 'run'`) and **runBlend** (`0..1`).
- Optional `mover` callback `(pos, dx, dz) => void` for wall collision.

### ProceduralPose.ts

Procedural bone overrides applied **AFTER `mixer.update`**.

> **Ordering contract:** mixer first, **then** procedural — otherwise the mixer overwrites your bone changes.

Currently implements **head look-at**.

### Character.tsx (R3F)

- Loads the glb via `useGLTF`.
- Clones with **`SkeletonUtils.clone`** from `'three/examples/jsm/utils/SkeletonUtils.js'` — **NOT `scene.clone`** (skinned meshes must rebind to the cloned skeleton).
- `useFrame` order **every frame**:
    ```
    motor.update
      → pick gait
      → animator.play / blend
      → animator.update
      → pose.update
      → apply motor position/yaw to the group
    ```

### ThirdPersonPlayer.tsx

- **WASD** drives the motor **camera-relative** (**Shift = run**).
- Wall collision via `level solidAt`.
- Camera follows behind: `CAM_DIST 2.2`, `CAM_HEIGHT 1.5`.
- Pointer-lock mouse orbit.

### Key naming note

three.js `GLTFLoader` **strips dots** from node/bone names. SIDEKICK and Mesh2Motion bones use **underscores** (`upperarm_l`), so names **survive clean**.

> Contrast: the FPS arm viewmodel rig uses **dots** (`bicep.r` becomes `bicepr`) and does _not_ survive clean. The full-body rig avoids this entirely.

---

## 4b. Foot grounding (two distinct problems)

Mesh2Motion source clips bake feet at **different heights** relative to the pelvis — some clips (notably `Sword_Idle`/`Sword_Attack`) hang the whole body ~0.12 above the floor, and separately leave **one foot raised** in the stance. Rokoko copies bone **rotations** with no foot-plant IK, so **re-retargeting reproduces the same float** (verified: a fresh headless retarget put `Sword_Idle` feet at 0.219 vs the committed 0.197). Two separate issues:

**(1) Body height** — the whole character floats because the clip's lowest foot sits above the floor. This is a single per-clip **vertical offset**.

**(2) Raised foot** — even after grounding the lowest foot, the _other_ foot stays lifted (the sword stance is authored weight-on-one-leg). This is a **per-foot pose** problem — vertical grounding cannot fix it; it needs foot-IK per leg. **Open.**

### Why body-height grounding must be RUNTIME, not baked

The obvious fix — bake a `pelvis` translation.y offset per clip (`art/character/footplant_bake.mjs`, kept for reference) — **breaks jumps**. It shifts pelvis inside stance/locomotion clips but the `Jump_*` clips stay at the neutral pelvis, so a jump (especially armed: `Sword_Idle` baked-low → `Jump_*` neutral → land → `Sword_Idle`) **snaps the body vertically** = "legs pull up before planting." A per-clip vertical constant must **blend across clip transitions**, so it has to live outside the clips.

> `footplant_bake.mjs` gotcha if you ever do use it: the glTF exporter **dedupes identical constant accessors** (9 clips shared one `pelvis` translation accessor), so editing bytes in place compounds every offset onto every clip. The script gives each clip a private accessor copy first. But prefer the runtime approach below.

### Runtime foot-IK (shipped — `footIK.ts` + `Character.tsx`)

The professional, **clip-agnostic** grounding system (like Unreal IK Rig / Unity Animation Rigging). Every clip just plays; a per-frame runtime pass grounds the feet. New animations need **zero** per-clip work. Two passes each grounded frame (disabled while `motor.airborne` — the motor owns the jump arc):

1. **Body-adjust** — measure the lowest ankle (`foot_l/r`), smoothly shift the group Y (`shift += (target−shift)·(1−e^{−14dt})`) so the lowest ankle lands at `floorY + ANKLE_HEIGHT` (0.049). Handles the body-height float for any clip; smoothing avoids takeoff/landing pops.
2. **Two-bone leg IK** (`groundLeg`) — for each leg whose ankle is within `FOOT_LOCK` (0.15) of the floor, analytic law-of-cosines IK plants the ankle on the floor and levels the toe (flat sole), preserving bone lengths and the current knee-bend direction. Feet above the lock (swing phase) are left alone, so locomotion gaits stay intact.

Verified headless in three.js (identical code path): Sword_Idle/Idle plant both feet flat (ankle≈toe≈0.049); Walk alternates (planted foot grounded, swing foot free). `FOOT_LOCK`/`ANKLE_HEIGHT` are tunable in `Character.tsx`. The `aim()` helper rotates a bone by the world-space delta between its current and desired child direction, converted to local via the parent world quaternion — the same primitive used by the jump-leg mirror.

### Jump right-leg asymmetry (`mirror_jump_legs.py`)

The retarget over-rotated the **right** thigh in the jump clips (Jump_Loop R pitch ~125° vs L ~53°, erratic) — an asymmetric artifact, same right-side pattern as `fix_right_foot.py`. `art/character/mirror_jump_legs.py` mirrors the clean left leg onto the right (`thigh/calf/foot/ball`) in `Jump_Start/Loop/Land` **only** (locomotion legs alternate — never mirror those). **Direct quaternion copy fails for legs** (L/R rest axes differ); the correct mirror reflects the armature-space matrix: `pose_bone.matrix = MX @ left.matrix @ SX`, `MX=SX=diag(-1,1,1,1)`, applied parent-first with an update between bones. Baked into `character-anim.glb`.

## 5. Adding More Clips

1. Retarget more Mesh2Motion Actions in the **same Rokoko GUI pass** (steps 6–8 above).
2. Re-export, overwriting `public/models/character.glb`.
3. The `CharacterAnimator` **picks them up by name automatically** — use `animator.has(name)` / `animator.play(name)`. No code change required beyond referencing the new clip name.

---

## 6. File Reference

| Path                                                                                     | Role                                                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `~/Downloads/SIDEKICK_Starter_Unity_2021_3_v1_0_4.unitypackage`                          | Source Synty SIDEKICK package (gzipped tar)                                                        |
| `art/character/assemble_sidekick.py`                                                     | Blender headless — assembles chosen SIDEKICK parts into one rigged glb                             |
| `art/character/retarget_m2m.py`                                                          | Failed headless delta retarget — **reference only**                                                |
| `art/character/retarget_rokoko.py`                                                       | **Headless Rokoko retarget** (works on Blender 5.0.1 via `rokoko_beta`); run from `art/character/` |
| `art/character/footplant_bake.mjs`                                                       | Headless pelvis-Y grounding bake — **reference only** (breaks jumps; use runtime foot-IK)          |
| `art/character/mirror_jump_legs.py`                                                      | Mirror clean left leg onto right in jump clips (analytic matrix reflection); fixes retarget        |
| `src/game/character/footIK.ts`                                                           | Runtime two-bone foot-IK — clip-agnostic foot grounding (body-adjust + leg IK)                     |
| `public/models/character.glb`                                                            | Assembled SIDEKICK mesh (T-pose, 88 bones, 2 mats). Retarget overwrites it with baked Actions      |
| `public/models/m2m-character.glb`                                                        | Mesh2Motion placeholder mesh + all 88 clips (~5.7MB, zero-retarget)                                |
| `github.com/Mesh2Motion/mesh2motion-app` → `static/animations/human-base-animations.glb` | Source animation clips (88 clips, A-pose)                                                          |
| `src/game/character/CharacterAnimator.ts`                                                | AnimationMixer wrapper — crossfade, phase-sync blend, additive overlays                            |
| `src/game/character/CharacterMotor.ts`                                                   | Authoritative planar movement; drives animation via gait/runBlend                                  |
| `src/game/character/ProceduralPose.ts`                                                   | Post-mixer procedural bone passes (head look-at)                                                   |
| `src/game/character/Character.tsx`                                                       | R3F component — loads/clones glb, per-frame update order                                           |
| `src/game/character/ThirdPersonPlayer.tsx`                                               | WASD + pointer-lock third-person controller                                                        |
