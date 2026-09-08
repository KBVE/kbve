# kinetree

Closed-form hinge inverse kinematics for skeletal limbs. Pure `glam` core,
optional Bevy integration.

```toml
kinetree = "0.1"                                              # with bevy
kinetree = { version = "0.1", default-features = false, features = ["std"] }   # glam only
```

## What it does

A two-bone limb — hip/knee/ankle, shoulder/elbow/wrist — has one degree of
freedom at the middle joint and three at the root. `kinetree` solves the
middle joint in closed form on a hinge axis measured from the rest pose, then
swings the root to aim the result. One `atan2`, one `acos`, no iteration and
no convergence threshold.

```rust
use glam::{Quat, Vec3};
use kinetree::{LimbPose, RestHinge, solve_limb};

let rest = RestHinge::from_rest(hip, knee, ankle, thigh_rest_rotation).unwrap();
let pose = LimbPose { root: hip, mid: knee, tip: ankle, root_basis: thigh_rotation };
let solve = solve_limb(&pose, &rest, goal);

// solve.hinge_turn about solve.hinge_axis at the knee, then solve.root_swing at the hip.
```

## Why not a pole vector

A pole target asks the caller for the bend direction every frame. That is
invented data, and every rig that supplies one then needs confidence blending,
an anatomical fallback and a yaw cone to constrain the invention back to
something plausible. Measuring the hinge once from the rest pose needs none of
it.

## Why not the law of cosines

The cosine rule assumes the hinge is square to the root-mid-tip plane. On a
real skeleton it is not, so the tip lands short — measured at 3cm on one leg of
the rig this algorithm was written for. The closed-form hinge solve gives
±0.000.

## Why not measure the bend plane from the current pose

It degrades on a near-straight limb, which is what a leg spends most of its
time being. A leg at 158° gave a cross product of magnitude 0.074 against
`L1·L2` of 0.197 — a plane roughly 50° off anatomical, which the solve then
amplifies until the knee leaves the body.

## Bevy

```rust
app.add_plugins(KinetreePlugin);

commands.spawn((
    IkLimbBones { root: thigh, mid: shin, tip: foot },
    IkLimb { goal: ground_contact, weight: 1.0, ..default() },
));
```

The solver runs in `PostUpdate` after `AnimationSystems` and before
`TransformSystems::Propagate`, in the `KinetreeSystems` set. It composes each
bone's world transform from its ancestors rather than reading
`GlobalTransform`, which has not been propagated yet at that point and is one
frame stale — so a limb lands correctly on the frame its character moves.

`mid` must be a direct child of `root`, and `tip` of `mid`.

## Features

| feature | default | what                                                                                                                |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `std`   | yes     | glam's std math backend                                                                                             |
| `bevy`  | yes     | plugin, components, the solve system                                                                                |
| `libm`  | no      | route transcendentals through `libm` for cross-platform bit-identical results; pair with `default-features = false` |
