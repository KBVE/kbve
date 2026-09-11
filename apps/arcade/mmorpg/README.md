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
moon run mmorpg:build-wasm       # browser bundle into web/
moon run mmorpg:serve-wasm       # build + serve on :4321
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

## Browser limits

wasm32 tops out near 2 GB in practice, has no worker threads without
COOP/COEP headers, and cannot stream from a filesystem. The web target is a
reduced asset tier of the same game, not the full world.
