# FBX Animation to Rust: Conversation Export

## Turn 1

### User

Is there a way to convert fbx animation data into something at rust level using math?

### Assistant

Yes — but FBX itself is a container/format, so you first need to **parse** the FBX, then you can convert/evaluate the animation curves into Rust math types (`glam`, `nalgebra`, etc.) and store them however you want.

A practical pipeline is:

1. **Parse FBX**
    - Easiest robust option: `ufbx` Rust bindings (wraps the C `ufbx` library, handles FBX quirks well).
    - Other options: `fbx` crate, `russimp`/Assimp, or the official FBX SDK via FFI.
    - Pure-Rust FBX parsing is possible but painful because FBX is proprietary and full of edge cases.

2. **Extract animation curves**
   FBX animation is roughly:
    - `AnimationStack` → `AnimationLayer` → `AnimationCurveNode`
    - `AnimationCurveNode` gives channels like `d|X`, `d|Y`, `d|Z` for T/R/S
    - `AnimationCurve` contains `KeyTime` and `KeyValueFloat`

    So for a node you end up with curves for:
    - Translation X/Y/Z
    - Rotation X/Y/Z
    - Scale X/Y/Z

3. **Convert times**
   FBX KTime is usually:

    ```rust
    let t_seconds = key_time as f64 / 46_186_158_000.0;
    ```

    Or sample at your target FPS, e.g. 30/60 Hz.

4. **Evaluate the curves mathematically**
    - Constant: step
    - Linear: `lerp`
    - Cubic: Hermite/Bezier interpolation using FBX tangents

    Example Hermite:

    ```rust
    fn hermite(t: f32, p0: f32, m0: f32, p1: f32, m1: f32, dt: f32) -> f32 {
        let t2 = t * t;
        let t3 = t2 * t;
        (2.0 * t3 - 3.0 * t2 + 1.0) * p0
            + (t3 - 2.0 * t2 + t) * m0 * dt
            + (-2.0 * t3 + 3.0 * t2) * p1
            + (t3 - t2) * m1 * dt
    }
    ```

5. **Build Rust math transforms**

    ```rust
    use glam::{Mat4, Quat, Vec3, EulerRot};

    let translation = Vec3::new(tx, ty, tz);
    let rotation = Quat::from_euler(
        EulerRot::XYZ, // use FBX rotation order, not always XYZ
        rx.to_radians(),
        ry.to_radians(),
        rz.to_radians(),
    );
    let scale = Vec3::new(sx, sy, sz);

    let local = Mat4::from_scale_rotation_translation(scale, rotation, translation);
    ```

6. **Handle FBX coordinate/unit quirks**
    - FBX may be Y-up/Z-up, right/left-handed, cm/m, etc.
    - Read `GlobalSettings`: `UpAxis`, `FrontAxis`, `CoordAxis`, `UnitScaleFactor`.
    - Apply a root correction matrix, e.g. convert Z-up to Y-up with a rotation.
    - Rotation values are usually degrees, so convert to radians.
    - Watch out for pre/post rotation, pivots, and inherit types.

7. **For skeletal animation**
    - Traverse node hierarchy: `world = parent_world * local`
    - Skinning matrix: `skin = world * inverse_bind_matrix`
    - Store per-bone local TRS or matrices per frame.

8. **Store in Rust**
    ```rust
    struct Key<T> {
        time: f32,
        value: T,
    }

    struct Track<T> {
        keys: Vec<Key<T>>,
    }

    struct AnimationClip {
        duration: f32,
        translation: Vec<Track<Vec3>>,
        rotation: Vec<Track<Quat>>,
        scale: Vec<Track<Vec3>>,
    }
    ```
    Or bake everything to `Vec<[f32; 16]>` / `Vec<Mat4>` for each bone per frame.

So: **yes, you can convert FBX animation to Rust-level math data**, but the math part is only the evaluation/interpolation. The hard part is correctly parsing FBX and handling its coordinate-system, rotation-order, and interpolation quirks. Using `ufbx` to load/evaluate and then converting to `glam`/`nalgebra` is usually the most reliable route.

---

## Turn 2

### User

Would that then make it more efficient? If we want to blend the data?

### Assistant

Yes — **potentially much more efficient**, but the win doesn’t come from “using Rust math” by itself. It comes from **baking/evaluating the FBX once into a runtime-friendly representation**, then blending that representation every frame.

FBX is an interchange format. If you keep calling `ufbx`/FBX SDK every frame to evaluate curves, you still pay for:

- string/property lookups
- curve evaluation
- C FFI overhead
- coordinate-system and rotation-order quirks
- non-cache-friendly data access

If instead you convert to Rust-native local TRS poses / baked frames, blending becomes simple math over flat arrays.

## What to convert it to

For blending, the usual target is **local-space TRS per bone**:

```rust
struct Pose {
    translations: Vec<Vec3>,
    rotations: Vec<Quat>,
    scales: Vec<Vec3>,
}
```

Or baked per-frame:

```rust
struct BakedClip {
    fps: f32,
    frames: Vec<Pose>, // one Pose per frame
}
```

Key points:

- Convert rotations to **quaternions** once. Then blending is `slerp`/`nlerp`, not Euler interpolation.
- Convert degrees to radians, apply coordinate correction, unit scale, etc. once.
- Store local TRS, not world matrices. Blend in local space, then compute world matrices.
- Precompute bind poses, bone hierarchy, inverse bind matrices.

## Why this helps blending

With baked Rust data, sampling a clip becomes:

1. Find frame index `i` from time.
2. `lerp`/`slerp` between frame `i` and `i+1`.

Then blending two clips is just:

```rust
fn blend(a: &Pose, b: &Pose, t: f32, out: &mut Pose) {
    for i in 0..out.len() {
        out.translations[i] = a.translations[i].lerp(b.translations[i], t);
        out.rotations[i] = a.rotations[i].slerp(b.rotations[i], t);
        out.scales[i] = a.scales[i].lerp(b.scales[i], t);
    }
}
```

For multiple clips, you sample each into a scratch pose, then weighted-accumulate. Quaternions need normalization or iterative slerp, but it’s still very fast compared to FBX curve evaluation.

This is also very SIMD/parallel friendly if you use SoA layout:

```rust
struct PoseSoA {
    tx: Vec<f32>, ty: Vec<f32>, tz: Vec<f32>,
    rx: Vec<f32>, ry: Vec<f32>, rz: Vec<f32>, rw: Vec<f32>,
    sx: Vec<f32>, sy: Vec<f32>, sz: Vec<f32>,
}
```

## But there are tradeoffs

- **Blending cost is still O(bones × active_clips).** Baking removes FBX evaluation, but you still have to blend each bone for each clip. You can’t magically blend 10 clips for free.
- **Memory grows fast.** Rough estimate: 100 bones × 60 fps × 10 s × ~40 bytes ≈ 2.4 MB per clip. Many clips → hundreds of MB. You can reduce with keyframe reduction, quantization, or storing curves instead of every frame.
- **Baking fidelity vs. memory.** Bake at 30/60 fps for games; if you need exact FBX tangents, you either keep the curves or bake very densely.
- **If you just wrap FBX evaluation in Rust structs, you gain almost nothing.** The gain comes from offline baking / runtime-native sampling.

## Practical pipeline

1. Offline: parse FBX with `ufbx` or similar.
2. Extract `AnimationCurveNode`/`AnimationCurve` data.
3. Evaluate curves to local TRS, convert to quaternions, apply coordinate fixes.
4. Bake at target FPS or store optimized keyframes.
5. Runtime: sample clip → pose, blend poses → world matrices → skinning.
6. Optimize: SoA, SIMD, job system, keyframe reduction, quantization, additive layers.

So: **yes, converting FBX animation into Rust-native baked poses can make blending much more efficient**, especially if you blend every frame. The main gains are avoiding FBX evaluation, using cache-friendly arrays, and enabling SIMD/parallel blending. The main costs are memory and one-time conversion/baking.

---

## Turn 3

### User

If I play at 60 fps , would I want to bake at 60? Or would it be better at 30?

### Assistant

Short answer: **not necessarily**. Bake rate should be driven by the animation’s content and your memory/CPU budget, not by your display/playback rate. For most character animation, **30 Hz baked + runtime interpolation is usually fine at 60 fps**, and it halves memory. Bake at 60 if you need the extra fidelity or want to skip runtime interpolation, but understand the tradeoff.

### What happens if you bake at 30 and play at 60?

At runtime you sample between two baked frames:

```rust
let t = (time * 30.0).fract();
out = a.lerp(b, t);        // translation/scale
out = a.slerp(b, t);       // rotation
```

That’s cheap. For 100 bones and a few blended clips, it’s still very manageable. You get smooth 60 fps output as long as the motion doesn’t have high-frequency detail that 30 Hz can’t capture.

### What happens if you bake at 60?

- **Memory doubles** vs 30 Hz.
- At exactly 60 fps playback, you can often just index the nearest/current frame — no interpolation.
- If you play at 144 Hz or variable fps, you **still need interpolation** between baked frames, so the “no interpolation” benefit disappears.

### Quality differences

- **30 Hz + linear interpolation** can show slight faceting on very fast rotations or quick directional changes.
- **60 Hz** captures those better.
- But if the original FBX was authored at 30 Hz, baking at 60 just duplicates/interpolates data — no new information.

### Memory example

100 bones, 10 seconds:

- 30 Hz: 300 frames × 100 bones × ~40 bytes ≈ **1.2 MB**
- 60 Hz: 600 frames × 100 bones × ~40 bytes ≈ **2.4 MB**

Multiply by dozens/hundreds of clips and it adds up fast.

### Practical recommendation

- **Default: bake at 30 Hz** for typical character animation, especially if you blend many clips or care about memory/cache.
- **Bake at 60 Hz** if:
    - the source has 60+ Hz keys,
    - the motion is fast/high-frequency (fighting, sports, facial),
    - you need frame-exact timing,
    - you have plenty of memory and want the simplest/fastest runtime sampling.
- **Better than uniform baking:** adaptive baking or keyframe reduction. Only store frames where the curve deviates beyond an error threshold, then interpolate at runtime.

So: 30 is often the better default. 60 is a valid choice when fidelity or runtime simplicity matters more than memory.

---

## Turn 4

### User

If the NPCs look different but have the same skeleton would that still add on for the cost?

### Assistant

Short answer: **It depends on which cost you mean.** Same skeleton means you can **share the animation data**, but each NPC can still add **runtime cost** if it animates independently. Different looks (mesh/texture/material) don’t multiply the animation clip memory, but they do affect skinning and rendering cost.

Break it down:

### 1. Animation clip memory — shared, no extra per NPC

Baked clips, keyframes, curves, etc. are tied to the **skeleton**, not the mesh. If 50 NPCs share one skeleton, they can all reference the same baked animation clips.

- 1 skeleton → 1 set of clips
- 50 NPCs with that skeleton → still 1 set of clips in memory
- Different meshes/textures → no extra animation clip memory

So: **no, appearance doesn’t add to animation data memory** as long as the skeleton is truly the same.

### 2. Per-NPC animation state — yes, it adds

Each NPC usually needs its own runtime state:

```rust
struct AnimationPlayer {
    time: f32,
    speed: f32,
    blend_weights: [f32; N],
    active_clips: [ClipId; N],
    // maybe a scratch Pose
}
```

If NPCs are at different animation times, blending different clips, or have different speeds, each one must be sampled/blended separately. That cost scales with **number of NPCs × bones × active clips**.

If they’re all in perfect sync, you can evaluate once and share the pose. But that’s rare for NPCs.

### 3. Skinning — yes, it adds per NPC

Even with the same skeleton, each NPC has its own mesh with its own vertices and skinning weights. Skinning cost is roughly:

```text
vertices × bones_per_vertex × number_of_NPCs
```

So a 50k-vertex NPC costs more to skin than a 5k-vertex NPC, even if they share the same skeleton and animation clips.

You can share the **bone matrices** if the pose is identical, but you still skin each mesh.

### 4. Rendering — depends on appearance

Different meshes, textures, and materials usually mean:

- more draw calls
- less batching/instancing
- more GPU state changes

This is separate from animation math, but it’s real cost. If they look different enough, you can’t just instance one mesh.

### 5. What actually scales

For 100 NPCs with the same skeleton:

| Cost                        | Shared?           | Scales with NPC count? |
| --------------------------- | ----------------- | ---------------------- |
| Baked animation clips       | Yes               | No                     |
| Animation sampling/blending | No, unless synced | Yes                    |
| Bone matrix computation     | No, unless synced | Yes                    |
| Skinning                    | No                | Yes                    |
| Draw calls/materials        | No                | Yes                    |

### Practical optimizations

- **Share clips** across all NPCs with the same skeleton.
- **Share evaluated poses** for NPCs in the same animation state (crowd sync).
- **Animation LOD**: update distant NPCs at 10–15 Hz instead of 60.
- **GPU skinning / instancing** where possible.
- **Retargeting** if proportions differ — but then it’s not really the same skeleton.

So: **same skeleton saves animation data memory and lets you reuse clips, but each independently animated NPC still adds runtime sampling, blending, and skinning cost.** Different looks mainly add rendering/skinning cost, not animation clip cost.

---

## Turn 5

### User

Yeah the issue I am having is the humanoid does not walk like a normal human animation even though I provided one?

### Assistant

That symptom — “same skeleton type, but the walk looks wrong” — almost always means the animation is being applied in **local bone space without retargeting**, or the two skeletons aren’t actually identical in the ways that matter. “Humanoid” is a semantic label; it doesn’t guarantee matching rest poses, bone rolls, or hierarchy.

Here are the usual culprits, roughly in order of likelihood:

### 1. You’re copying local rotations directly (no retargeting)

This is the #1 cause. If you take the source clip’s local `Quat` per bone and assign it to the target bone, it only works when:

- both skeletons share the **exact same rest pose**
- bone local axes point the same way
- hierarchy order/parenting is identical

If any of those differ, limbs twist, feet point sideways, arms bend backward, etc.

**Fix:** retarget in world space.

```text
For each bone:
  src_world_delta = src_rest_world^-1 * src_animated_world
  tgt_world       = tgt_rest_world * src_world_delta
  tgt_local       = tgt_parent_world^-1 * tgt_world
```

That converts “how the source bone moved in world space” onto the target’s rest orientation, instead of blindly copying local values.

### 2. Rest pose mismatch (T-pose vs A-pose)

If the source was authored in T-pose and the target’s bind/rest is A-pose, direct local copy will rotate every arm bone by ~40–45°. This alone makes a walk look like the NPC is holding invisible boxes.

**Fix:** same world-delta retarget as above, or re-author the target’s rest pose to match.

### 3. Bone roll / local axis differences

Even with the same bone names and positions, Blender/Maya/FBX exporters can give bones different rolls. A thigh bone’s local +X might point forward on one rig and sideways on the other. Local rotation copy then produces wrong twist.

**Fix:** retarget via world deltas, or normalize bone rolls before export.

### 4. FBX PreRotation / PostRotation / InheritType

FBX nodes carry `PreRotation`, `PostRotation`, `RotationOffset`, `RotationPivot`, and `InheritType`. If your loader ignores these, local rotations will be off even for a single rig.

**Fix:** make sure `ufbx` (or whatever you use) applies these, or bake them out to plain TRS at import.

### 5. Root motion vs in-place

If the source walk has root motion (translation on the root/hips) but your NPC controller also moves the root, you get foot sliding, stutter, or the character drifting. Or if the source is in-place and you expected root motion, the NPC “walks” without moving.

**Fix:** decide which system owns translation; strip root motion from the clip or disable the controller’s root move.

### 6. Scale / unit mismatch

FBX units: cm vs m, and `UnitScaleFactor`. If the source is cm and target is m (or vice versa), you get tiny/huge translations per frame — legs hyperextend, feet teleport.

**Fix:** apply `UnitScaleFactor` and `GlobalSettings` axis correction at import.

### 7. Coordinate system (Y-up vs Z-up)

FBX often stores Z-up; engines are usually Y-up. Without a root correction, the character walks “into the floor” or leans sideways.

**Fix:** apply the up-axis conversion matrix once at the root.

### 8. Different bone lengths / proportions

Retargeting world deltas fixes orientation, but if the target’s legs are longer, you’ll still get foot sliding unless you also solve IK or scale the root motion. This is a “looks almost right but feet skate” symptom.

### 9. Missing hip translation

A normal walk needs vertical hip bob and lateral sway. If you only copy rotations and skip translation curves on the hips, the walk looks stiff/robotic.

**Fix:** make sure translation channels are retargeted too, not just rotation.

### 10. Euler order / interpolation

If you’re reading FBX Euler curves and applying them with the wrong rotation order, you get gimbal weirdness that looks like “almost a walk but wrong.”

**Fix:** convert to quaternions using the rig’s declared rotation order, then slerp at runtime.

---

### Quick diagnostic

To narrow it down fast:

1. **Bind/rest pose only** (no animation): do both skeletons line up? If not → rest pose or axis issue.
2. **Apply frame 0 of the clip to both** in a viewer: do they match? If not → retargeting / pre-rotation issue.
3. **Apply only rotations**: do limbs point the right way? If not → bone roll / local axis issue.
4. **Apply only translations**: does the root move correctly? If not → root motion / unit / axis issue.
5. **Watch the feet**: sliding = proportions/root motion; twisting = retargeting; hyperextension = scale.

---

### Most likely fix for your case

Given “humanoid provided a normal walk but it doesn’t walk normally,” the most probable cause is **direct local TRS copy without world-space retargeting**, possibly combined with **rest pose (T vs A) mismatch**. Implementing the world-delta retarget formula above usually fixes the “walks like an alien” look. After that, handle root motion and units, and it should look right.

If you tell me:

- which loader you’re using (`ufbx`, `fbx` crate, Assimp, custom),
- whether you’re copying local or world transforms,
- and what specifically looks wrong (twisting, sliding, leaning, stiff),

I can point to the exact step to change.

---

## Turn 6

### User

Can you turn our whole conversation into a markdown file for me to download
