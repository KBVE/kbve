# uniti

C FFI bridge from KBVE Bevy game logic crates to Unity via `csbindgen`.

Builds as a `cdylib` (`libuniti.dylib` / `uniti.dll` / `libuniti.so`) and is consumed by the Unity-side `Uniti.g.cs` bindings inside `apps/rareicon/unity-rareicon/`.

## Bundled Surface

- `bevy_pathfinder` — grid flow-field navigation
- `bevy_inventory` — item / slot persistence
- `bevy_battle` — combat resolution
- `bevy_skills` — skill / proc tables
- `rusqlite` (bundled) — save-archive persistence, no system libsqlite3 dep
- `zstd` (default-features off) — pure-Rust compression for save blobs

## Build

Per-platform Nx targets copy the artifact straight into the Unity project's `Plugins/` tree and (on macOS) re-codesign it adhoc to satisfy Gatekeeper.

```sh
npx nx run uniti:build:macos
npx nx run uniti:build:windows
npx nx run uniti:build:linux
npx nx run uniti:build:all
```

## Bindings

`build.rs` runs `csbindgen` to emit the C# wrapper consumed by Unity. The generated file lives at:

```
apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/Native/Uniti.g.cs
```

## License

MIT
