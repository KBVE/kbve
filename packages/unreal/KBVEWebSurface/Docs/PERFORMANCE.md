# Performance

CEF is expensive. Treat live web surfaces as premium content.

## Defaults

- `MaxFrameRate`: 30 fps per surface. Billboards usually fine at 10–15.
- `bPauseWhenOffscreen`: true. Saves a frame budget when the player isn't looking.
- `SnapshotDistance`: 0 (off). Set non-zero to fall back to a single baked frame past N units.

## Concurrent cap

`UKBVEWebSurfacePool::MaxConcurrent` caps live surfaces per game instance (default 8). Surfaces past the cap should fall back to snapshot mode (LRU eviction).

Override via `Project Settings → Plugins → KBVE Web Surface → Max Concurrent Surfaces`.

## Recommended budgets

| Surface kind       | Live count | Frame rate | Notes                         |
| ------------------ | ---------- | ---------- | ----------------------------- |
| Player UI terminal | 1–2        | 30–60      | Active interaction            |
| Hub kiosks         | 4–8        | 15–30      | Pause offscreen               |
| Billboards         | 0          | snapshot   | One-time bake, no live render |
| Combat HUD         | 0          | n/a        | Use Slate/UMG instead         |

## Use Slate/UMG, not webview, for

- Health bars, combat HUD
- Inventory during gameplay
- Quest tracker, minimap
- Anything ticking every frame

## Use webview for

- Marketplace / auction house
- Account / guild / social screens
- Admin and debug panels
- Patch notes / news boards
- Interactive in-world terminals
- Crafting and mail
