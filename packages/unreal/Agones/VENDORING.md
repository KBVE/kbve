# Vendored: Agones Unreal SDK

Upstream: https://github.com/googleforgames/agones — `sdks/unreal/Agones`
Pinned release: `release-1.58.0` (commit `ca71cbeaa998417021073d5fde3bd57128293d1b`)
Plugin version: 2.0.0 (unchanged across recent Agones releases — the Unreal SDK
sources are byte-identical from at least 1.57 through 1.58.0)
License: Apache-2.0 (headers preserved on every source file)

This is a pristine mirror of the upstream plugin with one deliberate deviation:

- `Agones.uplugin` — added `"TargetAllowList": [ "Server" ]` on the `Agones`
  module so it compiles into dedicated-server targets only and is excluded from
  Client/Game builds. `UAgonesSubsystem::ShouldCreateSubsystem` already gates to
  dedicated server at runtime; the allowlist also keeps it out of client
  compiles. The KBVE-specific ROWS bridge lives in the separate `KBVEAgones`
  plugin, not here, to keep this mirror clean for upstream resyncs.

## Resync

```
git clone --depth 1 --branch release-1.58.0 --filter=blob:none --sparse https://github.com/googleforgames/agones.git
cd agones && git sparse-checkout set sdks/unreal
# diff sdks/unreal/Agones against packages/unreal/Agones, re-apply the TargetAllowList line
```
