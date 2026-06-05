# KBVE Web Surface

Game-agnostic Unreal Engine plugin for rendering interactive web content onto 3D surfaces — billboards, terminals, kiosks, holograms, in-world dashboards.

## Features

- `UKBVEWebSurfaceComponent` — flat in-world web panel via `UWidgetComponent`. Self-contained; no UMG `.uasset` required.
- `UKBVEWebRenderSurfaceComponent` — render-to-texture path for curved meshes, holograms, CRT-style screens.
- `AKBVEWebTerminalActor` — drop-in actor bundling mesh frame + surface + auth-aware load for one-step consumer integration.
- `AKBVEWebSurfaceActor` — minimal surface-only actor (use when you supply your own framing).
- `UKBVEWebInteractionComponent` — pre-configured `WidgetInteractionComponent` for flat-surface input.
- `UKBVEWebBridge` — typed JS↔UE message bus, auto-bound via `UWebBrowser::BindUObject`.
- `UKBVEWebSurfaceSettings` — URL allow/deny list and project-wide perf defaults.
- `UKBVEWebLODManager` + `UKBVEWebSurfacePool` — frustum/distance LOD and concurrent-surface cap. Components self-register.
- Pluggable `IKBVEWebBackend` — default CEF backend, drop-in alternates (Ultralight, WebUI) ship as separate plugins.
- `UKBVEWebInputRouter` — raw UV→pixel helper for curved meshes (deprecated for flat surfaces; superseded by `UKBVEWebInteractionComponent`).

## Engine

- Unreal Engine 5.6
- Win64, Mac, Linux

## Quick start

See [Docs/QUICKSTART.md](Docs/QUICKSTART.md).

## Performance

See [Docs/PERFORMANCE.md](Docs/PERFORMANCE.md).

## License

MIT — see [LICENSE](LICENSE).
