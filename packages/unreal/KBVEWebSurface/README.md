# KBVE Web Surface

Game-agnostic Unreal Engine plugin for rendering interactive web content onto 3D surfaces — billboards, terminals, kiosks, holograms, in-world dashboards.

## Features

### Surfaces

- `UKBVEWebSurfaceComponent` — flat in-world web panel via `UWidgetComponent`. Self-contained; no UMG `.uasset` required.
- `UKBVEWebRenderSurfaceComponent` — render-to-texture path for curved meshes, holograms, CRT-style screens.

### Drop-in actors

- `AKBVEWebTerminalActor` — interactive terminal (mesh frame + flat surface + auth provider hook).
- `AKBVEWebKioskActor` — low-perf info kiosk (15 fps, snapshot fallback). Patch notes, signage.
- `AKBVEWebBillboardActor` — non-interactive banner with URL rotation list and timer.
- `AKBVEWebHologramActor` — curved/holo variant wrapping `UKBVEWebRenderSurfaceComponent`.
- `AKBVEWebSurfaceActor` — minimal surface-only actor (no mesh frame).

### Components

- `UKBVEWebInteractionComponent` — pre-configured `WidgetInteractionComponent` for flat-surface input.
- `UKBVEWebTerminalPromptComponent` — distance-based approach-prompt visibility delegate.
- `UKBVEWebFocusComponent` — input focus lifecycle (mouse cursor, GameAndUI mode).

### Auth + bridge

- `IKBVEWebAuthProvider` + `UKBVEWebAuthProvider_Anonymous` + `UKBVEWebAuthProvider_Static` — pluggable JWT/token source.
- `UKBVEWebBridge` — typed JS↔UE message bus auto-bound via `UWebBrowser::BindUObject`.
- `KBVEWebChannels` namespace — canonical channel names every surface speaks (`terminal.ready`, `auth.refresh`, `inventory.use`, `market.purchase`, …).

### Infrastructure

- `UKBVEWebSurfaceSettings` — URL allow/deny list and project-wide perf defaults.
- `UKBVEWebLODManager` + `UKBVEWebSurfacePool` — frustum/distance LOD and concurrent-surface cap. Components self-register.
- Pluggable `IKBVEWebBackend` — default CEF backend, alternates (Ultralight, WebUI) ship as separate plugins.

### Sample content

- `Content/Web/sample-terminal.html` — minimal self-contained page that exercises the bridge end-to-end.

### Deprecated

- `UKBVEWebInputRouter` — raw UV→pixel helper retained for curved-mesh math only; superseded by `UKBVEWebInteractionComponent` for flat surfaces.

## Engine

- Unreal Engine 5.6
- Win64, Mac, Linux

## Quick start

See [Docs/QUICKSTART.md](Docs/QUICKSTART.md).

## Performance

See [Docs/PERFORMANCE.md](Docs/PERFORMANCE.md).

## License

MIT — see [LICENSE](LICENSE).
