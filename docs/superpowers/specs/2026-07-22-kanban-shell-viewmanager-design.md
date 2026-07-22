# Kanban Dashboard — Shell Integration + View Management Redesign

**Date:** 2026-07-22
**Route:** `/dashboard/kanban/`
**Files:** `apps/kbve/astro-kbve/src/components/dashboard/AstroKanbanDashboard.astro`, `useKanbanSection.ts`, new `kanbanViewManager.ts`, the 8 `ReactKanban*` islands (7 charts + Browser).

## Problem

The kanban dashboard renders as a full-viewport GSAP "fullpage-snap" takeover:

- `.kb-snap-container { position: fixed; inset: nav 0 0 content-start }` covers the whole viewport.
- The GSAP `Observer` hijacks wheel/touch, sets `document.body.style.overflow = 'hidden'`, and animates one section at a time via `yPercent`.

Two consequences:

1. **Bento shell + rail invisible.** `MarkdownContent.astro`'s `isDashboard` branch DOES render the rail + breadcrumb for `/dashboard/kanban/`, but the fixed overlay paints over them. The rail exists in the DOM, covered.
2. **GSAP fights the shell.** The viewport-owning fullpage system is built for a standalone route, not a component nested in the Starlight docs shell + bento grid. Wheel-snap no-ops or looks broken because the fixed layer and the shell's own scroll disagree.

The two layouts (full-viewport GSAP fullpage vs. bento-shell-with-rail) are mutually exclusive as built.

Additionally, all 8 chart islands are `client:only="react"` — every React shell hydrates and fetches on load; D3 render is gated by `useKanbanSection` (latch-once, **never unmounts**). No real unload path.

## Goals

- Kanban lives **inside** the dashboard shell `dash-main` column. Rail + breadcrumb always visible. No `position:fixed`, no `body{overflow:hidden}`, no viewport takeover.
- Native vertical scroll within the shell (no wheel-hijack).
- **Proper view management:** heavy D3 chart islands mount as they near the viewport and **unmount** when far, with hysteresis to avoid thrash.
- GSAP repurposed (not removed): `ScrollTrigger` drives reveal-on-enter animation + the live-set that gates mount/unmount.
- Clean lifecycle: init on `astro:page-load`, full teardown on `onSwap` (ClientRouter navigation).

## Non-Goals

- No change to the chart internals / D3 logic beyond mount/unmount lifecycle + a height-preserving skeleton.
- No change to `MarkdownContent.astro` (its `isDashboard` branch already supplies the shell for `/dashboard/kanban/`).
- No change to the data pipeline (`nx-kanban.json`, `/data/nx/nx-kanban.json` fetch).
- Dot-nav is removed (see Decisions), not reworked.

## Decisions

| Decision               | Choice                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Scroll paradigm        | Native stacked scroll inside `dash-main` + lazy mount/unmount                          |
| Right-side dot-nav     | **Dropped** — the dashboard rail is the single nav system                              |
| View-manager mechanism | GSAP `ScrollTrigger` (reveal + live-set), not raw IntersectionObserver                 |
| Mount/unmount policy   | **Keep-warm ±2 sections**; unmount only when a section is >2 away from the active band |
| Re-entry               | Distant charts re-init D3 from scratch on return (acceptable given ±2 keep-warm)       |

## Architecture

### 1. Layout rewrite — `AstroKanbanDashboard.astro`

Remove:

- `.kb-snap-container { position: fixed; inset: … }` and the `background`/`z-index` viewport styling.
- `.kb-section { position:absolute; top:3.5rem; … visibility:hidden }` absolute stacking + the `[data-section='0']{visibility:visible}` progressive-enhancement hack.
- The `.kb-section-outer` / `.kb-section-inner` `yPercent` wrapper machinery (only existed for the fullpage snap).
- The GSAP `Observer` script block (wheel/touch hijack, body overflow mutation, `gotoSection`, dot handlers, hashchange nav).
- The `.kb-dot-nav`, `.kb-dot`, `.kb-section-label` markup + styles.

Replace with:

- `.kb-sections` — a normal-flow vertical stack. Each `.kb-section` is a `bento-section` band containing a `bento-frame`/`kb-card` of natural height. Sections flow and scroll with the shell's native scroll; no fixed heights, no overlays.
- Keep the existing per-section content markup (Summary static block, chart mount points, Breakdown static block, Board, Browser).
- Each chart mount point keeps `data-section={i}` for the view manager to register against.
- Bento alignment: sections use `bento-section` + `bento-frame--fluid` so they inherit the shell's hairlines/spacing. The `MarkdownContent` neutralizer (`.dash-main :global(.bento-frame){max-width:none;…}`) already prevents double-framing.

### 2. View manager — new `kanbanViewManager.ts`

One module, imported by the Astro `<script>`:

```
init():
  register gsap ScrollTrigger.create per `.kb-section[data-section]`:
    - start/end spanning the section
    - onEnter (once): gsap reveal (opacity 0→1, y 12→0) on the section's card
  compute a "live set" = indices within ±2 of the currently-centered section
  on scroll (throttled via ScrollTrigger's own rAF): if live set changed,
    write document.documentElement.dataset.liveSections = "a,b,c"
teardown():
  ScrollTrigger.getAll().forEach(t => t.kill())
  remove dataset.liveSections
```

- Live-set band = **±2**. A section unmounts only when its index leaves that band (keep-warm), satisfying "unmount far only."
- The centered-section index derived from ScrollTrigger progress / viewport midpoint against section offsets.
- No `Observer`, no wheel preventDefault, no body-overflow mutation.

### 3. Island gate rewrite — `useKanbanSection.ts`

Change `useKanbanSection(i)` from **latch-forever** to **live-set membership**:

```
useKanbanSection(i): boolean
  reads document.documentElement.dataset.liveSections (comma list)
  returns liveSet.has(i)
  MutationObserver on attribute `data-live-sections` updates on change
```

- When `i` enters the live set → hook returns `true` → chart mounts + D3 runs.
- When `i` leaves (>2 away) → returns `false` → chart child unmounts → D3/SVG torn down (React unmount + existing cleanup effects).
- `useKanbanData` unchanged (each island fetches; browser caches the JSON).

### 4. Chart islands — `ReactKanban*.tsx`

Minimal change — they already gate render on `useKanbanSection`. Required:

- Ensure the chart's outer wrapper renders a **height-preserving skeleton** when the gate is `false` (fixed min-height matching the mounted chart) so unmount/mount does not cause scroll-jump. If the current fallback is `null`, replace with a skeleton box.
- Verify each chart's `useEffect` cleanup fully removes D3 selections / event listeners / ResizeObservers on unmount (they will now actually unmount).
- `client:only="react"` retained (SSR of D3 not viable); the React shell is cheap — the heavy D3 body is what mounts/unmounts via the gate.
- `ReactKanbanBrowser` (section 9) currently takes no `sectionIndex` and is ungated. Add `sectionIndex={9}` so it participates in the live-set (mount/unmount) like the others.

### 5. Lifecycle

```
document.addEventListener('astro:page-load', () => viewManager.init())
onSwap(() => viewManager.teardown())
```

`astro:page-load` fires on hard load + every ClientRouter swap (ClientRouter is active — Sidebar/tooltip islands already depend on it). `onSwap` guarantees ScrollTriggers + MutationObservers don't leak across navigation.

## Data Flow

```
nx-kanban.json ──(build)──> AstroKanbanDashboard static blocks (Summary, Breakdown, Pipeline)
                    │
                    └─(runtime fetch /data/nx/nx-kanban.json)─> each mounted ReactKanban* island

scroll ──> GSAP ScrollTrigger ──> centered index ──> live-set(±2) ──> html[data-live-sections]
                                        │                                      │
                                   reveal anim                          useKanbanSection(i)
                                                                               │
                                                                   mount/unmount D3 chart
```

## Testing / Verification

Manual (via `/run` or built HTML), since this is layout + scroll behavior:

1. **Shell present:** `/dashboard/kanban/` shows rail + breadcrumb beside content; no full-viewport overlay; page scrolls natively (no `body{overflow:hidden}`).
2. **Reveal:** sections fade/slide in on first entry.
3. **Mount:** scrolling a chart into the ±2 band mounts it (D3 renders); DOM node count grows.
4. **Unmount:** scrolling >2 sections away removes the chart's SVG from the DOM (verify via devtools node count drop); skeleton holds height (no scroll-jump).
5. **Re-entry:** returning re-renders the chart correctly.
6. **Navigation:** ClientRouter away + back re-inits cleanly; no duplicate ScrollTriggers (check `ScrollTrigger.getAll().length`), no leaked MutationObservers.
7. **Mobile:** sections stack + scroll; heavy Sankey/Heatmap remain hidden per existing `@media(max-width:640px)` rules (carry those over).
8. **No-JS fallback:** first section (Summary, static) visible without JS.

Build via `pnpm nx run astro-kbve:build`. If frontmatter/shell looks stale, `rm -rf apps/kbve/astro-kbve/.astro node_modules/.vite` before rebuild (known Astro content-layer cache gotcha).

## Risks

- **Scroll-jump on unmount** if skeleton height ≠ chart height. Mitigation: fixed min-heights per section matching mounted chart; test #4.
- **ScrollTrigger + shell scroll container:** the shell scrolls the document (not an inner overflow container), so default ScrollTrigger (scroller = viewport) applies. Confirm no ancestor of `.kb-sections` establishes its own scroll/containing block; if one does, pass `scroller` explicitly.
- **D3 cleanup gaps:** charts that previously never unmounted may have incomplete teardown; audit each `useEffect` return.
