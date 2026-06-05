# KBVE Web Surface

Game-agnostic Unreal Engine plugin for rendering interactive web content onto 3D surfaces — billboards, terminals, kiosks, holograms, in-world dashboards.

## Features

- `UKBVEWebSurfaceComponent` — flat in-world web panel via `UWidgetComponent`.
- `UKBVEWebRenderSurfaceComponent` — render-to-texture path for curved meshes, holograms, CRT-style screens.
- `AKBVEWebSurfaceActor` — drop-in actor for terminals and kiosks.
- `UKBVEWebInputRouter` — line-trace → hit-UV → widget-pixel mapping for player interaction.
- `UKBVEWebBridge` — typed JS↔UE message bus.
- `UKBVEWebSurfaceSettings` — URL allow/deny list and project-wide perf defaults.
- `UKBVEWebLODManager` + `UKBVEWebSurfacePool` — frustum/distance LOD and concurrent-surface cap.
- Pluggable `IKBVEWebBackend` — default CEF backend, drop-in alternates (Ultralight, WebUI) ship as separate plugins.

## Engine

- Unreal Engine 5.6
- Win64, Mac, Linux

## Quick start

See [Docs/QUICKSTART.md](Docs/QUICKSTART.md).

## Performance

See [Docs/PERFORMANCE.md](Docs/PERFORMANCE.md).

## License

MIT — see [LICENSE](LICENSE).
