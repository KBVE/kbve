# Sidebar — Custom Starlight Left Sidebar (astro-kbve)

Design spec for replacing the thin `<Default/>` wrapper sidebar in
`apps/kbve/astro-kbve` with a data-driven custom sidebar that **enhances**
Starlight 0.41 rather than forking it.

The component stays in Starlight's `Sidebar` override slot and consumes
Starlight's own route data (`Astro.locals.starlightRoute.sidebar`). Starlight
keeps building the nav tree (autogenerate directories, manual groups, auth
attrs, badges); we render that tree with our own markup and add new behavior.

## Goals

- **Custom markup** — own DOM for groups/links (icons, brand chrome, animations) beyond what CSS vars on the default markup allow.
- **New behavior** — mini-collapse rail, in-sidebar filter, per-group persisted open/closed state.
- **Better auth gating** — keep the `data-auth-visibility` attr+CSS gating working, emitted verbatim from inherited entry attrs.
- **Inherit Starlight functions** — sidebar tree data, active/current state, collapsible groups, badges + custom attrs.

Non-goals: restructuring how the nav tree is built (config stays the source),
adding new dependencies (no Alpine/React for the sidebar), changing the right
`PageSidebar`.

## Current state

| Piece           | Path                                                           | Now                                                                                                                            |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Override slot   | `apps/kbve/astro-kbve/src/components/navigation/Sidebar.astro` | Wraps `@astrojs/starlight/components/Sidebar.astro` `<Default/>` in a `transition:persist` div + inline active-tracking script |
| Component map   | `apps/kbve/astro-kbve/astro.config.mjs` (~line 88)             | `Sidebar: './src/components/navigation/Sidebar.astro'`                                                                         |
| Nav tree source | `astro.config.mjs` (~line 192-362)                             | Manual groups + `autogenerate: { directory }`, auth via `attrs: { 'data-auth-visibility' }`                                    |
| Styles          | `apps/kbve/astro-kbve/src/styles/global.css`                   | Brand palette vars, `--sl-color-bg-sidebar`, `data-auth-visibility` show/hide rules                                            |

Starlight version: `@astrojs/starlight ^0.41.1` (root `package.json`; pnpm root deps only).

## Inheritance hook

In a Starlight 0.41 `Sidebar` override, the built nav tree is available as:

```ts
const { sidebar } = Astro.locals.starlightRoute; // SidebarEntry[]
```

`SidebarEntry` is a discriminated union:

```ts
type SidebarEntry =
	| {
			type: 'link';
			label: string;
			href: string;
			isCurrent: boolean;
			attrs: Record<string, string | number | boolean | undefined>;
			badge: { text: string; variant: string } | undefined;
	  }
	| {
			type: 'group';
			label: string;
			entries: SidebarEntry[];
			collapsed: boolean;
			badge: { text: string; variant: string } | undefined;
	  };
```

This is the single source of truth — autogenerate output, manual groups, auth
`attrs`, badges, and the per-route `isCurrent` flag are all already resolved
here. We never re-read `astro.config.mjs`; we render this array.

## Architecture

```
Sidebar.astro (override slot)
 ├─ const { sidebar } = Astro.locals.starlightRoute
 ├─ <nav data-kbve-sidebar-root transition:persist="kbve-sidebar"
 │        data-kbve-rail="expanded">
 │   ├─ <button data-kbve-rail-toggle aria-expanded>      (mini-collapse)
 │   ├─ <input  data-kbve-filter type="search">            (filter)
 │   └─ <KbveSidebarSublist entries={sidebar} depth={0} /> (own markup)
 └─ <script is:inline data-astro-rerun>                     (all behavior)

KbveSidebarSublist.astro (new, recursive)
 ├─ group → <details data-kbve-group data-group-id={id} open?={…}>
 │            <summary data-kbve-summary>{label}{badge}</summary>
 │            <KbveSidebarSublist entries={entry.entries} depth={depth+1}/>
 │          </details>
 └─ link  → <a href data-kbve-link {...entry.attrs}
               aria-current={entry.isCurrent ? 'page' : undefined}>
               {label}{badge}
             </a>
```

### Files

- `src/components/navigation/Sidebar.astro` — rewrite; drop `<Default/>`, read `starlightRoute.sidebar`, render chrome + sublist + behavior script.
- `src/components/navigation/KbveSidebarSublist.astro` — **new**, recursive renderer for groups/links.
- `src/styles/global.css` — add sidebar chrome styles (rail collapsed state, filter box, group/summary). Reuse existing brand vars; **leave `data-auth-visibility` rules untouched**.

## Data-attribute contract

All behavior keys off `data-kbve-*` hooks so markup and script stay decoupled.
(If Alpine is ever adopted repo-wide, these map 1:1 onto `x-data`/`x-bind`
directives — see Appendix; not in scope now.)

| Attribute                | On           | Meaning                                                    |
| ------------------------ | ------------ | ---------------------------------------------------------- |
| `data-kbve-sidebar-root` | root `<nav>` | Script scope root                                          |
| `data-kbve-rail`         | root `<nav>` | `expanded` \| `collapsed`; drives CSS rail mode            |
| `data-kbve-rail-toggle`  | `<button>`   | Click toggles rail; mirrors `aria-expanded`                |
| `data-kbve-filter`       | `<input>`    | Filter source; `input` event filters links                 |
| `data-kbve-group`        | `<details>`  | A collapsible group                                        |
| `data-kbve-group-id`     | `<details>`  | Stable slug = `/`-joined slugified label path; persist key |
| `data-kbve-summary`      | `<summary>`  | Group header                                               |
| `data-kbve-link`         | `<a>`        | A nav link; filter target                                  |

### Group id derivation

`data-kbve-group-id` = ancestor group labels + own label, each slugified
(lowercase, non-alphanumeric → `-`, collapsed), joined with `/`. Stable across
builds as long as labels are stable. Example: `Game Data` > `Item DB` →
`game-data/item-db`.

## Behavior (inline vanilla JS + localStorage)

Single IIFE, idempotent, guarded by `window.__kbveSidebarBound`. Runs on load
and rebinds on `astro:after-swap` / `astro:page-load` (ClientRouter SPA). The
root is `transition:persist`, so the DOM survives swaps — script must be
re-entrant.

1. **Active state** — SSR sets `aria-current="page"` from `entry.isCurrent`. On
   swap, script re-normalizes `location.pathname` vs each `data-kbve-link`
   `href` (strip hash/query, trailing slash), sets/clears `aria-current`, and
   walks up opening every ancestor `<details>` so the current page is visible.
   (Ports the existing `normalize`/`update` logic.)
2. **Mini-collapse rail** — toggle sets `data-kbve-rail` on root +
   `aria-expanded` on button. CSS hides labels/filter and narrows to an icon
   rail when `collapsed`. Persist to `kbve:sidebar:rail`. Restore on load.
3. **In-sidebar filter** — `input` event lowercases query, shows/hides
   `data-kbve-link` by label substring; a group with zero visible links hides;
   non-empty filter force-expands matching groups; `Esc` clears + restores.
   **Not persisted** (ephemeral per visit).
4. **Per-group persist** — each `<details>` `toggle` writes `{ [groupId]: open }`
   to `kbve:sidebar:groups` (JSON map). On load, apply saved state — **except**
   active-page auto-expand (rule 1) always wins over a saved-closed state.

### Precedence

active-page auto-expand > active filter expand > saved per-group state > `entry.collapsed` default.

## Error handling / edge cases

- `sidebar` empty/undefined → render empty `<nav>`, no throw.
- `localStorage` blocked (private mode) → all reads/writes in `try/catch`; degrade to no-persist, behavior still works in-session.
- `transition:persist` keeps DOM → all script ops idempotent; `__kbveSidebarBound` prevents double event binding.
- Auth gating unchanged → `entry.attrs` spread verbatim onto `<a>`, so `data-auth-visibility` + existing CSS keep gating items; filter/rail never override gating (CSS `display:none` from gating wins).
- External links (`http`, `//`, `mailto:`, `tel:`) skipped by active-state matcher.

## Testing

Playwright e2e (existing `apps/kbve/astro-kbve/e2e/`):

- Sidebar renders expected top-level groups + links from config.
- Rail toggle collapses to icon rail; state persists across reload.
- Filter narrows links by label; empty groups hide; `Esc` clears.
- Navigating to a nested doc expands its ancestor groups and marks the link `aria-current="page"`.
- Per-group: collapse a group, reload → stays collapsed; navigate into it → auto-expands (precedence).
- Auth-gated item hidden for anon (`html` without `data-auth-tone='auth'`).

No unit layer — pure markup/DOM behavior; e2e is the right altitude.

## Rollout

- New git worktree off `dev` (worktrees only; never checkout in main repo; never push dev/main direct).
- Implement, run `./kbve.sh -nx` build + e2e for astro-kbve.
- PR back to `dev`.

## Appendix — Alpine `x-data` (future, out of scope)

The `data-kbve-*` contract is designed so a later Alpine adoption is a drop-in:
root `x-data="{ rail:'expanded', filter:'', groups:{} }"`, `x-model` on the
filter input, `x-bind:data-kbve-rail` on root, `x-persist` (alpine-persist) for
`rail`/`groups`. Not added now — no Alpine dependency in the repo, and vanilla
JS matches the current Sidebar pattern. Listed only so the attribute naming
isn't reworked if Alpine lands.
