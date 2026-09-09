# Profiler

In-page diagnostics, reachable as `window.__profiler` in **every** build.

Not dev-gated on purpose. Every rendering bug in this game so far only
reproduced in a packed production build — gltfpack folding constant animation
tracks to one keyframe, meshopt `-cc` decoding differently from `-c` — so a
profiler that disappears in prod cannot see the bugs worth chasing. Nothing runs
until `start()`, so the cost of shipping it is a few kB.

## Use

```js
__profiler.start(); // frame clock + WebGL call timing
__profiler.start({ gl: false }); // frames only
__profiler.start({ spikeMs: 30 }); // lower the stall threshold
__profiler.stop(); // returns the report, unhooks
__profiler.report(); // read without stopping
```

Report shape:

```
{ ms, frames: { frames: {n, median, p99, max}, spikes: [{t, dt, attributed}], spikeCount },
  gl: [{name, calls, total, max}], pose: [{name, degrees: {...}, jumps}] }
```

`spikes[].attributed` splits a stalled frame by what was spent inside it, so you
can tell "the driver blocked" from "the driver was idle and something else ran".

## Animation / pose

```js
__profiler.watchPose(['spine_01', 'hand_r', 'head']);
__profiler.watchPose(['spine_01'], { near: __coll.pos }); // pick a rig
```

Reports per-frame **local** rotation deltas in degrees. World-space motion is
useless on anything that moves under its own power — a wandering NPC swamps the
pose signal — whereas local rotation is the pose and nothing else.

Reading it:

- small steady median → a clip is driving the bone, normal
- **constant** delta every frame (median == p99) → something is compounding onto
  the bone instead of riding on top of the clip pose. That is exactly how the
  goblin spine bug read: 3.4°/frame, which was `SPINE_FLEX_DEFAULT` (4) times
  `spine_01`'s 0.85 frac, because three's `PropertyMixer` skips `setValue()` for
  a track whose value never changes and the procedural pass premultiplied onto
  whatever the bone already held.
- occasional large `jumps` → clip switches, usually fine

Bone names repeat across every rig in the scene. Without `near`, you get
whichever `traverse` reaches first, which may be a different character than the
one you meant.

## Driving it headlessly

`e2e/profiler.spec.ts` starts a profiler run against a production build. For
ad-hoc work, drive it with Playwright and read the report back:

```js
await page.evaluate(() => __profiler.start());
// ... play the game ...
const report = await page.evaluate(() => __profiler.stop());
```

## What it will not tell you

- **Load stalls before the first user interaction.** `start()` runs too late.
  Use the CDP profiler from the driver instead (`Profiler.enable` +
  `Profiler.start` _before_ `page.goto`), and anchor CDP's monotonic
  microseconds to `performance.now()` with a uniquely-named busy loop — the two
  clocks share no epoch, and misaligning them silently yields empty buckets.
- **Real driver costs, headlessly.** Headless runs on SwiftShader, where shader
  compilation is far cheaper than on a real GPU. Absence of GL cost in a
  headless run is not evidence of absence on hardware.
