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
**SharedArrayBuffer support** must be on: it is what makes itch send COOP/COEP,
and the bundle's shared memory does not instantiate without cross-origin
isolation.

## Threads

The browser bundle is built with shared memory: `+atomics,+bulk-memory`,
`--shared-memory` over an imported memory, and std rebuilt with `-Z build-std`
on nightly. The module's memory is a `SharedArrayBuffer` at runtime, so the page
must be cross-origin isolated or it will not instantiate at all -- `serve-web`
sends COOP/COEP locally, and **SharedArrayBuffer support** must be switched on
for the game on itch.

This costs one fork. egui dropped `Send + Sync` from `DroppedFileHandle` on
`wasm32 + atomics` in [#8354](https://github.com/emilk/egui/pull/8354), because
the `web_sys::File` it started storing there is not thread-safe. `egui::Context`
holds one transitively, a non-`Send` `Context` cannot be a bevy `Component`, and
`bevy_egui` stops compiling -- 326 errors. `bevy_egui` never stores a
`web_sys::File` (its `BevyDroppedFile` is a `PathBuf`), so the root `Cargo.toml`
patches `egui` to [KBVE/egui](https://github.com/KBVE/egui) `kbve-base`, one
commit off the `0.36.2` tag restoring the bound. Upstream:
[emilk/egui#8401](https://github.com/emilk/egui/issues/8401),
[vladbat00/bevy_egui#498](https://github.com/vladbat00/bevy_egui/issues/498).
Drop the patch and the fork when #8401 lands.

What this does **not** give you is a threaded bevy schedule. bevy 0.19 gates
`multi_threaded` off on wasm32 regardless -- `cfg(all(not(target_arch =
"wasm32"), feature = "multi_threaded"))` in `bevy_tasks` -- so the ECS still runs
on one thread. What it gives is a module that can share memory with a worker,
which is the half that cannot be added afterwards without rebuilding std.

## Browser limits

wasm32 tops out near 2 GB in practice, has no worker threads without
COOP/COEP headers, and cannot stream from a filesystem. The web target is a
reduced asset tier of the same game, not the full world.
