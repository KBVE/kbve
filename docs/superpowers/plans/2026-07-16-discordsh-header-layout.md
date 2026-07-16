# Discord.sh Skinny Header + Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Starlight-owned chrome with an own lightweight header + layout that wraps the whole discord.sh site, keeping the `@kbve/astro` stack (DroidProvider, OverlayShell, Supabase auth).

**Architecture:** Own `Layout.astro` mounts the shared providers once and renders an own `Header.astro`; `Header` consumes the existing icon-row `NavBar.astro` (tooltip engine + `ReactNavBar` auth island) with all `virtual:starlight/*` imports removed. Chrome CSS tokens move into `global.css` so nothing depends on Starlight loading them. Starlight stays installed but is demoted off `/` (follow-up spec moves its content under `/docs`).

**Tech Stack:** Astro 5, Tailwind v4 (`@tailwindcss/vite`), React islands (`client:only`), `@kbve/astro` + `@kbve/droid` (nanostores, Supabase auth, droid workers), Starlight (docs only).

## Global Constraints

- Build via nx: `nx run astro-discordsh:<target>` (or `./kbve.sh -nx astro-discordsh:<target>`). Never raw `astro`.
- Work in a git worktree; branch off `dev`; PR targets `dev`. No direct commit/push to `dev`/`main` in the main tree.
- No co-author / Claude trailer in commits.
- `DroidProvider` + `OverlayShell` mount **exactly once** across the page (Layout only).
- Keep `client:only="react"` on all islands (no SSR of auth).
- Chrome must render on non-Starlight routes — no `virtual:starlight/*` in main-site components.
- Icon-row nav preserved (Home / Docs / Dashboard); Docs points to `/docs`.

---

## File Structure

- `src/styles/global.css` — add `:root` design tokens (the `--sl-color-*` / `--sl-nav-*` names the chrome consumes).
- `src/components/header/Header.astro` — rewrite: own header shell, no Starlight virtuals.
- `src/components/navigation/NavBar.astro` — edit: drop duplicate provider mounts, repoint Docs link.
- `src/layouts/Layout.astro` — rewrite: skinny base, single provider mount, renders `Header`.
- `src/pages/index.astro` — rewrite: minimal front page using `Layout`.
- `src/content/docs/index.mdx` — remove (frees `/` for `pages/index.astro`).

---

### Task 1: Chrome design tokens in global.css

**Files:**
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: CSS custom properties on `:root` consumed by `Header.astro` and `NavBar.astro`: `--sl-color-white`, `--sl-color-gray-2`, `--sl-color-gray-5`, `--sl-color-gray-6`, `--sl-color-accent`, `--sl-color-accent-low`, `--sl-color-bg-nav`, `--sl-color-hairline`, `--sl-nav-gap`, `--sl-nav-pad-x`.

- [ ] **Step 1: Read current global.css**

Run: `sed -n '1,40p' apps/discordsh/astro-discordsh/src/styles/global.css`
Note whether a `:root` block already exists and whether `@import`/`@layer` ordering matters (Tailwind v4 `@import "tailwindcss"`).

- [ ] **Step 2: Add token block**

Append (or merge into existing `:root`) after any `@import`:

```css
:root {
	--sl-color-white: #f4f4f5;
	--sl-color-gray-2: #a1a1aa;
	--sl-color-gray-5: #3f3f46;
	--sl-color-gray-6: #27272a;
	--sl-color-accent: #8b5cf6;
	--sl-color-accent-low: rgba(139, 92, 246, 0.15);
	--sl-color-bg-nav: #18181b;
	--sl-color-hairline: #27272a;
	--sl-nav-gap: 1rem;
	--sl-nav-pad-x: 1rem;
}
```

- [ ] **Step 3: Verify build still compiles**

Run: `nx run astro-discordsh:check`
Expected: PASS (no CSS/type errors introduced).

- [ ] **Step 4: Commit**

```bash
git add apps/discordsh/astro-discordsh/src/styles/global.css
git commit -m "feat(discordsh): add own chrome design tokens to global.css"
```

---

### Task 2: NavBar.astro — drop duplicate providers, repoint Docs

**Files:**
- Modify: `src/components/navigation/NavBar.astro`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: `<NavBar/>` renders icon row + tooltip + `ReactNavBar` island only (no providers). Docs link → `/docs`.

- [ ] **Step 1: Remove provider imports + mounts**

In `NavBar.astro` frontmatter, remove:

```astro
import { DroidProvider } from '@kbve/astro';
import { OverlayShell } from '../overlay/OverlayShell';
import { workerURLs } from '../../lib/workers';
```

In the template, remove the trailing single-mount block:

```astro
<DroidProvider
	client:only="react"
	workerURLs={workerURLs}
	i18nPath="/i18n/db.json"
	dataPath="/data/servers.json"
/>
<OverlayShell client:only="react" />
```

Keep `import ReactNavBar from './ReactNavBar.tsx';` and the `<ReactNavBar client:only="react" currentPath={currentPath} />` mount.

- [ ] **Step 2: Repoint Docs link**

Change the Docs `<a>` `href` from `/guides/getting-started` to `/docs`. Update its `active` check to `currentPath.startsWith('/docs')`.

- [ ] **Step 3: Verify check passes**

Run: `nx run astro-discordsh:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/discordsh/astro-discordsh/src/components/navigation/NavBar.astro
git commit -m "refactor(discordsh): NavBar drops dup providers, points Docs to /docs"
```

---

### Task 3: Header.astro — Starlight-free own shell

**Files:**
- Modify (rewrite): `src/components/header/Header.astro`

**Interfaces:**
- Consumes: `<NavBar/>` (Task 2), tokens (Task 1).
- Produces: `<Header/>` — logo + nav shell, no `virtual:starlight/*`.

- [ ] **Step 1: Rewrite Header.astro**

Replace entire file:

```astro
---
import NavBar from '../navigation/NavBar.astro';
---

<header class="dsh-header">
	<a href="/" class="dsh-brand" data-astro-prefetch>
		<img
			src="/images/discord-sh-text.webp"
			alt="Discord.sh"
			class="dsh-logo"
		/>
	</a>
	<div class="dsh-nav">
		<NavBar />
	</div>
</header>

<style>
	.dsh-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sl-nav-gap);
		height: 3.5rem;
		padding: 0 var(--sl-nav-pad-x);
		background: var(--sl-color-bg-nav);
		border-bottom: 1px solid var(--sl-color-hairline);
		position: sticky;
		top: 0;
		z-index: 40;
	}
	.dsh-brand {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}
	.dsh-logo {
		height: 1.75rem;
		width: auto;
		object-fit: contain;
	}
	.dsh-nav {
		display: flex;
		align-items: center;
	}
</style>
```

- [ ] **Step 2: Verify check passes (no starlight virtual import errors)**

Run: `nx run astro-discordsh:check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/discordsh/astro-discordsh/src/components/header/Header.astro
git commit -m "feat(discordsh): Starlight-free own header shell"
```

---

### Task 4: Layout.astro — skinny base, single provider mount

**Files:**
- Modify (rewrite): `src/layouts/Layout.astro`

**Interfaces:**
- Consumes: `<Header/>` (Task 3).
- Produces: `Layout` accepting `title`, `description?`, `ogImage?`, `ogType?`; renders `Header` + `<slot/>` + one `DroidProvider` + one `OverlayShell`.

- [ ] **Step 1: Rewrite Layout.astro**

Replace entire file:

```astro
---
import Header from '../components/header/Header.astro';
import { DroidProvider } from '@kbve/astro';
import { OverlayShell } from '../components/overlay/OverlayShell';
import { workerURLs } from '../lib/workers';
import '../styles/global.css';

interface Props {
	title: string;
	description?: string;
	ogImage?: string;
	ogType?: string;
}

const {
	title,
	description = 'Discord.sh - Discord Bot & Tools',
	ogImage = 'https://discord.sh/og/default.png',
	ogType = 'website',
} = Astro.props;

const siteUrl = 'https://discord.sh';
const pageUrl = new URL(Astro.url.pathname, siteUrl).href;
const fullOgImage = ogImage.startsWith('http') ? ogImage : new URL(ogImage, siteUrl).href;
---

<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="description" content={description} />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
		<link rel="icon" type="image/x-icon" href="/favicon.ico" />
		<link rel="canonical" href={pageUrl} />
		<title>{title}</title>

		<meta property="og:type" content={ogType} />
		<meta property="og:url" content={pageUrl} />
		<meta property="og:title" content={title} />
		<meta property="og:description" content={description} />
		<meta property="og:image" content={fullOgImage} />
		<meta property="og:site_name" content="Discord.sh" />

		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={title} />
		<meta name="twitter:description" content={description} />
		<meta name="twitter:image" content={fullOgImage} />
	</head>
	<body>
		<Header />
		<slot />
		<DroidProvider
			client:only="react"
			workerURLs={workerURLs}
			i18nPath="/i18n/db.json"
			dataPath="/data/servers.json"
		/>
		<OverlayShell client:only="react" />
	</body>
</html>
```

- [ ] **Step 2: Verify check passes**

Run: `nx run astro-discordsh:check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/discordsh/astro-discordsh/src/layouts/Layout.astro
git commit -m "feat(discordsh): skinny Layout with Header + single provider mount"
```

---

### Task 5: Wire front page, free `/` from Starlight, verify end-to-end

**Files:**
- Modify (rewrite): `src/pages/index.astro`
- Remove: `src/content/docs/index.mdx`

**Interfaces:**
- Consumes: `Layout` (Task 4).

- [ ] **Step 1: Rewrite index.astro**

Replace entire file:

```astro
---
import Layout from '../layouts/Layout.astro';
---

<Layout title="Discord.sh — Discord Server Directory">
	<main class="dsh-main">
		<h1>Discord.sh</h1>
	</main>
</Layout>

<style>
	.dsh-main {
		max-width: 72rem;
		margin: 0 auto;
		padding: 2rem 1rem;
	}
</style>
```

- [ ] **Step 2: Remove the Starlight splash so `/` has no route collision**

Run: `git rm apps/discordsh/astro-discordsh/src/content/docs/index.mdx`

- [ ] **Step 3: Full build**

Run: `nx run astro-discordsh:build`
Expected: PASS — no duplicate-route warning for `/`, no `virtual:starlight` errors.

- [ ] **Step 4: Manual dev verification**

Run: `nx run astro-discordsh:dev`
Check at `/`:
- Own header renders: logo + icon row (Home / Docs / Dashboard) + auth slot.
- Tooltips appear on icon hover.
- Mobile width: hamburger opens the drawer.
- Sign-in modal opens from the auth slot (Supabase island booted).
- No duplicate overlay/provider (single toast/overlay root in DOM).
- `/docs` still renders under Starlight (its own chrome).

- [ ] **Step 5: Commit**

```bash
git add apps/discordsh/astro-discordsh/src/pages/index.astro
git commit -m "feat(discordsh): own front page on Layout, free / from Starlight"
```

---

## Self-Review

- **Spec coverage:** Layout rewrite (Task 4) ✓, Header rewrite (Task 3) ✓, NavBar edit incl. single-mount + Docs repoint (Task 2) ✓, global.css tokens (Task 1) ✓, minimal index.astro + route-collision removal (Task 5) ✓, testing via check/build/manual ✓. Out-of-scope items (docs move, servers grid, theme toggle) correctly excluded.
- **Placeholder scan:** all steps carry concrete code/commands. No TBD.
- **Type consistency:** provider mount props (`workerURLs`, `i18nPath`, `dataPath`) identical across Layout; `Layout` Props shape matches current consumers; token names identical between Task 1 and the CSS in Tasks 2–3.

## Notes / Risks

- If `nx run astro-discordsh:build` warns that Starlight still expects a root index, confirm no other `content/docs/index.*` exists. Only `index.mdx` present per current tree.
- `favicon.svg`/`favicon.ico` referenced in `<head>` must exist in `public/` (they already are, per current head config). Verify during Task 4 build.
- Starlight `head`/`social` config in `astro.config.mjs` is untouched here — it only affects `/docs` chrome now.
