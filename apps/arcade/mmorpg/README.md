# mmorpg

3D open-world MMORPG client on bevy 0.19 + avian3d 0.7. One source tree
compiles to a native binary and to a browser WebGPU bundle.

## Where this sits

| project               | camera                   | dimension                  |
| --------------------- | ------------------------ | -------------------------- |
| `apps/arcade/isometric` | orthographic             | 2.5D sprites               |
| `apps/arcade/colony`  | orthographic             | 3D geometry, 2D billboards |
| `apps/arcade/mmorpg`  | perspective third-person | 3D                         |

## Run

```bash
moon run mmorpg:run              # native, platform-default backend
moon run mmorpg:run-webgpu       # native, wgpu WebGPU backend
moon run mmorpg:build-web        # browser bundle into dist/
moon run mmorpg:serve-web        # build + serve on :4321 with COOP/COEP
```

Native picks vulkan/metal/dx12; the browser build is `--no-default-features
--features webgpu`, which drops the threaded task pool, avian's rayon solver
and the linux windowing backends.

## Controls

`WASD` move, `Shift` sprint, `Space` jump, drag mouse to orbit, scroll to zoom.

## Assets

`assets/characters/quaternius_ubc` is the Quaternius Ultimate Base Characters
set (CC0): 8 base bodies, 64 modular outfit pieces, 254 animation clips on one
65-joint Unreal-mannequin skeleton. See its README for the bone map.

Blobs are routed to `git.kbve.com/KBVE/arcade.git` by the `arcade` row in
`tools/lfs/remotes.tsv`, which covers all of `apps/arcade`.

## Release

A `mmorpg@<semver>` tag puts this project in the `web-game` lane:
`ci-web-game.yml` pulls the LFS assets from the `arcade` Forgejo remote, runs
`build-web`, uploads `dist/` as a run artifact, and pushes it to
[kbve.itch.io/mmorpg](https://kbve.itch.io/mmorpg) with butler on the `html5`
channel. The version on the channel is the tag's.

The itch page itself has to be set to an HTML game whose viewport matches the
canvas, with **This file will be played in the browser** on the `html5` upload.
Leave **SharedArrayBuffer support** off while the shipping bundle is the
single-threaded one -- it sets COOP/COEP, which costs a cross-origin isolation
the bundle does not need yet.

## Threads

`build-web-threaded` is the shared-memory build: `+atomics`, `--shared-memory`,
and std rebuilt with `-Z build-std`. It is not what ships, because it does not
compile today:

- `+atomics` makes wasm32 a threaded target, so bevy_ecs requires `Send + Sync`
  where it did not, and `bevy_egui` 0.42 fails on every system holding an
  `EguiContext` (`the trait Send is not implemented for HashMap<ViewportId,
  ViewportState, ...>`). egui is this game's UI, so there is nothing to gate off.
- bevy 0.19 disables `multi_threaded` on wasm regardless -- `bevy_tasks` gates
  it `cfg(all(not(target_arch = "wasm32"), feature = "multi_threaded"))` -- so
  the schedule would stay single-threaded even with shared memory.

When both clear, the switch is `WEB_GAME_TASK` in `moon.yml` and the
SharedArrayBuffer checkbox on the itch page.

## Browser limits

wasm32 tops out near 2 GB in practice, has no worker threads without
COOP/COEP headers, and cannot stream from a filesystem. The web target is a
reduced asset tier of the same game, not the full world.
