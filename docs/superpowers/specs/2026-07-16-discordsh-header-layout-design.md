# Discord.sh — Skinny Header + Layout Shell

Date: 2026-07-16
Project: `apps/discordsh/astro-discordsh`

## Goal

Replace the Starlight-owned chrome with an own lightweight header + layout that
wraps the whole site. Keep the KBVE stack (`@kbve/astro`: DroidProvider,
OverlayShell, Supabase auth, droid workers, nanostores). Drop only the
Starlight coupling from the main-site chrome.

This spec covers the **header + layout shell only**. Full Starlight demotion to
`/docs` and the servers/submit surfaces are separate follow-up specs.

## Context (current state)

- `astro.config.mjs` uses `@astrojs/starlight` as the primary route owner.
  Homepage = `content/docs/index.mdx` (splash). React + Tailwind v4 already set.
- `Header.astro` imports `virtual:starlight/*` (config, LanguageSelect, Search,
  SocialIcons, ThemeSelect) and overrides Starlight's Header slot.
- `NavBar.astro` = the real chrome: desktop icon row (Home / Docs / Dashboard),
  auth slot, mobile hamburger, shared tooltip engine, `ReactNavBar` auth island
  (`client:only`), plus `DroidProvider` + `OverlayShell` mounts.
- `Layout.astro` = orphan (zero imports). Mounts `DroidProvider` + `OverlayShell`
  and a `<slot/>`. Not rendered by anything today.
- `pages/index.astro` = empty stub (`---\n---`). Starlight owns `/`.
- CSS leans on `--sl-color-*` custom properties (Starlight-provided).

## Architecture decisions

- **Icon-row nav** retained (Home / Docs / Dashboard) with the shared tooltip
  engine — matches current UX.
- **Auth island kept** — reuse `ReactNavBar` (sign-in modal, avatar, drawer)
  via `@kbve/astro` + `lib/supa.ts`.
- **Single provider mount** — `DroidProvider` + `OverlayShell` mount exactly once,
  in `Layout.astro`. Remove the duplicate mounts from `NavBar.astro`.
- **Starlight-free chrome** — no `virtual:starlight/*` imports in the main-site
  header. Search / LanguageSelect / ThemeSelect / SocialIcons dropped for now.
- **Own tokens** — define the `--sl-color-*` names the chrome consumes in
  `global.css :root` so the header renders correctly on non-Starlight routes.

## Components

### `src/layouts/Layout.astro` (rewrite)

Skinny base layout, wraps every own page.

- Props: `title`, `description?`, `ogImage?`, `ogType?` (keep current shape).
- `<head>`: existing meta / OG / Twitter block (already correct — keep).
- `<body>`: `<Header/>`, then `<slot/>`, then a **single** `DroidProvider`
  (`client:only="react"`, `workerURLs`, `i18nPath="/i18n/db.json"`,
  `dataPath="/data/servers.json"`) and `<OverlayShell client:only="react" />`.
- No Starlight imports.

### `src/components/header/Header.astro` (rewrite)

Own header shell, no `virtual:starlight/*`.

- Layout: logo left (`/images/discord-sh-text.webp` → `/`, prefetch), `<NavBar/>`
  right. Responsive flex/grid.
- Own scoped CSS. No `@layer starlight.core`, no `--sl-nav-*` reliance beyond
  tokens defined in `global.css`.

### `src/components/navigation/NavBar.astro` (edit)

Keep icon row + tooltip engine + `ReactNavBar` island. Changes:

- **Remove** the `DroidProvider` and `OverlayShell` mounts (moved to Layout).
- Repoint Docs link `href` `/guides/getting-started` → `/docs`.
- Keep the tooltip `<script>` (store-driven) and existing styles.
- CSS keeps `--sl-color-*` names; they resolve from `global.css` tokens.

### `src/styles/global.css` (edit)

Add a `:root` token block defining the custom properties the chrome uses so it
renders without Starlight: at minimum `--sl-color-white`, `--sl-color-gray-2`,
`--sl-color-gray-5`, `--sl-color-gray-6`, `--sl-color-accent`,
`--sl-color-accent-low`, `--sl-color-bg-nav`, `--sl-color-hairline`,
`--sl-nav-gap`, `--sl-nav-pad-x`. Dark-theme defaults (site is dark).

### `src/pages/index.astro` (rewrite, minimal)

Real front page so the header is visible/testable:

- Imports and uses `Layout` with a title.
- Minimal body placeholder (hero/servers land in a later spec).

### Route collision note

While Starlight still ships `content/docs/index.mdx`, both it and
`pages/index.astro` target `/`. Astro `pages/` win, but to avoid a build warning
this spec **removes/renames `content/docs/index.mdx`** as the minimal enabling
change. (Moving the rest of docs under `/docs` = follow-up spec.)

## Data flow

- Auth: `ReactNavBar` → `initSupa()` / `authBridge` (`lib/supa.ts`) →
  nanostores `$auth`; avatar/drawer/modal render from store. Unchanged.
- Droid workers + overlay: `DroidProvider` (once, Layout) boots workers; tooltip
  store `$activeTooltip` drives the single shared tooltip element. Unchanged
  except single mount.

## Testing

- `nx run astro-discordsh:build` succeeds (no `virtual:starlight` errors on the
  new chrome, no duplicate-route error).
- `nx run astro-discordsh:check` passes.
- Manual: `/` renders own header (logo + icon row + auth), tooltips work, mobile
  hamburger opens drawer, sign-in modal opens; no double provider mount.
- `/docs` still served by Starlight (its own chrome) after index removal.

## Out of scope (follow-ups)

- Moving remaining Starlight content under `/docs`.
- Servers grid, submit form, hero content on `/`.
- Theme toggle, search, i18n selector in the new header.
