# KBVE Platform Migration Plan

Migration of kbve.com (standalone repo at `~/Documents/GitHub/kbve.com`) into the KBVE monorepo under `apps/kbve/`.

Source repo reference: `~/Documents/GitHub/kbve.com/website/astro/` (frontend) and `~/Documents/GitHub/kbve.com/website/axum/` (backend).

## Architecture

```
apps/kbve/
├── astro-kbve/          Frontend: Astro 5 + Starlight + React 19
├── astro-kbve-e2e/      Frontend E2E: Playwright
├── axum-kbve/           Backend:  Axum HTTP server + Askama SSR
├── axum-kbve-e2e/       Backend E2E:  Vitest + Docker
├── edge/                (existing) Deno edge functions
├── edge-e2e/            (existing) Edge E2E tests
├── kilobase/            (existing) PostgreSQL Rust extension
└── KBVE_PLAN.md         This file
```

### Data Flow

```
[Browser] → [astro-kbve (static)] → CDN
                                  ↘
[Browser] → [axum-kbve (dynamic)] → PostgreSQL / Supabase / Redis
                                  → Askama SSR (profiles, OSRS)
                                  → gRPC (internal services)

[Browser] → [edge/ (Deno)]        → Supabase Edge Functions (existing, unchanged)

Proto source of truth: packages/data/proto/kbve/
Shared Rust crates:    packages/rust/kbve/ + packages/rust/jedi/
Shared NPM packages:  @kbve/astro, @kbve/droid, @kbve/laser, @kbve/khashvault
```

### Relationship Between Services

- **astro-kbve** — Static site (docs, content, game UI). No server runtime.
- **axum-kbve** — Dynamic backend: serves Astro dist as static files, plus API routes, Askama SSR for profiles/OSRS, JWT auth, DB queries. Replaces `~/Documents/GitHub/kbve.com/website/axum/`.
- **edge/** — (existing) Supabase Deno edge functions. Remains unchanged. Handles serverless functions that don't belong in Axum.

---

## Dependency Audit

### Already in monorepo root (no action needed)

| Category      | Packages                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Astro         | astro, @astrojs/react, @astrojs/starlight, @astrojs/starlight-tailwind, @astrojs/sitemap, @astrojs/check |
| React         | react 19, react-dom 19, react-hook-form, lucide-react                                                    |
| 3D/Game       | three, @react-three/fiber, @react-three/drei, phaser, react-unity-webgl                                  |
| Styling       | tailwindcss 4, @tailwindcss/vite, @tailwindcss/postcss, postcss, cssnano, clsx, tailwind-merge           |
| Data          | zod, @supabase/supabase-js, dexie, nanostores, @nanostores/react, @nanostores/persistent                 |
| Astro plugins | astro-mermaid, starlight-site-graph, @astropub/worker, @vite-pwa/astro, mermaid                          |
| Build         | @bufbuild/buf (installed), sharp                                                                         |
| Testing       | @nx/playwright, vitest, playwright                                                                       |

### Missing (to add)

| Package                  | Purpose                            | Action                               |
| ------------------------ | ---------------------------------- | ------------------------------------ |
| `bitecs`                 | ECS library for arcade game engine | `pnpm add bitecs`                    |
| `starlight-theme-galaxy` | Starlight Galaxy theme             | `pnpm add -D starlight-theme-galaxy` |

### Shared packages already covering kbve.com functionality

| Package            | Replaces from kbve.com                                                 | Source reference                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@kbve/astro`      | Auth bridge, Askama components, toast/modal/tooltip, DroidProvider     | `~/kbve.com/website/astro/src/components/auth/AuthBridge.ts`, `~/kbve.com/website/astro/src/components/providers/`               |
| `@kbve/droid`      | Supabase gateway, workers (canvas, DB, WebSocket), state stores, Dexie | `~/kbve.com/website/astro/src/lib/gateway/`, `~/kbve.com/website/astro/src/workers/`, `~/kbve.com/website/astro/src/lib/supa.ts` |
| `@kbve/laser`      | Phaser + R3F integration layer                                         | `~/kbve.com/website/astro/src/arcade/`                                                                                           |
| `@kbve/khashvault` | Crypto/secure storage via Web Crypto API                               | (no direct equivalent in kbve.com, new capability)                                                                               |

### Rust workspace crates (already in Cargo.toml workspace)

| Crate         | Purpose                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `kbve 0.1.26` | Axum + Diesel boilerplate, Askama 0.15, JWT, argon2                        |
| `jedi 0.2.1`  | Data interchange, PostgreSQL (bb8), Redis (fred), gRPC (tonic), Twitch IRC |

---

## 1. astro-kbve

### 1.1 Directory Structure

```
apps/kbve/astro-kbve/
├── project.json              Nx targets: dev, build, build:osrs, preview, check, sync, proto
├── astro.config.mjs          Starlight + React + Tailwind + plugins
├── tsconfig.json             Strict, react-jsx, path aliases
├── tailwind.config.mjs       Purple theme (from kbve.com)
├── postcss.config.cjs        @tailwindcss/postcss + cssnano
├── buf.gen.yaml              buf generate config → src/generated/
├── scripts/
│   └── generate-osrs-items.mjs   OSRS Wiki API item generation
├── public/
│   ├── assets/               Brand images, data files
│   ├── manifest.json         PWA manifest
│   ├── robots.txt
│   └── ads.txt
└── src/
    ├── content/
    │   ├── content.config.ts Schema definitions (docs, itemdb, questdb, mapdb, application, project)
    │   └── docs/             Starlight content (25+ categories, see 1.5)
    ├── components/           Astro + React components (26 directories, see 1.6)
    ├── data/                 Schemas + types (see 1.7)
    ├── generated/
    │   └── proto/            buf-generated TypeScript + Zod
    ├── lib/                  Gateway, storage, utilities (see 1.8)
    ├── pages/
    │   └── api/              JSON API endpoints (see 1.9)
    ├── styles/
    │   └── global.css        Tailwind layers + theme vars + view transitions
    ├── workers/              Web workers (see 1.10)
    └── arcade/               Phaser game engine + ECS (see 1.11)
```

### 1.2 Astro Config

Source: `~/Documents/GitHub/kbve.com/website/astro/astro.config.mjs`

Key settings to port:

- **Output:** `static`
- **Site:** `https://kbve.com`
- **Trailing slash:** `always`
- **Image domains:** `images.unsplash.com`
- **Prefetch:** enabled
- **outDir:** `../../../dist/apps/astro-kbve` (monorepo convention)

**Integrations (in order):**

1. `worker()` — `@astropub/worker` for web worker support
2. `mermaid()` — theme: `"forest"`, auto-theme enabled, icon packs: `logos`, `iconoir`, flowchart curve: `basis`
3. `starlight()` — see Starlight config below
4. `react()` — React 19 integration
5. `sitemap()` — default locale: `en`

**Starlight config:**

- Title: `"KBVE"`
- Default locale: `"root"` (English only; es/ja/ko commented out in source)
- Edit link: `https://github.com/kbve/kbve.com/edit/main/website/astro` (update for monorepo)
- Expressive code: enabled
- Custom CSS: `./src/styles/global.css`
- Social links: GitHub (`https://github.com/kbve/kbve`), Discord
- **Custom component overrides:**
    - `SiteTitle` → `./src/components/navigation/SiteTitle.astro`
    - `PageSidebar` → `./src/components/pagesidebar/PageSidebar.astro`
    - `Footer` → `./src/components/footer/AstroFooter.astro`
- **Plugins:**
    - `starlightThemeGalaxy()` — Galaxy theme customization
    - `starlightSiteGraph()` — Interactive site graph with extensive config
- **Sidebar** (all autogenerated from directories):
    - Guides, Applications, Project, Memes, Gaming, Arcade, Assets (Crypto, Stocks), Theory, ItemDB, QuestDB, MapDB, Blog, Journal, Recipe, Legal

**Vite config:**

- Plugins: `@tailwindcss/vite`
- Build externals: `fsevents`, `../pkg`
- Excluded from optimization: `fsevents`

### 1.3 TypeScript Config

Source: `~/Documents/GitHub/kbve.com/website/astro/tsconfig.json`

```json
{
	"extends": "astro/tsconfigs/strict",
	"include": [".astro/types.d.ts", "**/*"],
	"exclude": ["dist"],
	"compilerOptions": {
		"jsx": "react-jsx",
		"jsxImportSource": "react",
		"baseUrl": ".",
		"paths": {
			"@/*": ["src/*"],
			"@kbve/astro": ["../../../packages/npm/astro/src/index.ts"],
			"@kbve/droid": ["../../../packages/npm/droid/src/index.ts"]
		}
	}
}
```

Note: kbve.com uses `"baseUrl": "src"` with `"@/*": ["*"]`. Monorepo convention uses `"baseUrl": "."` with `"@/*": ["src/*"]`. Adjust imports accordingly.

### 1.4 Nx project.json Targets

Following `astro-memes` / `astro-mc` pattern:

| Target        | Command                                                             | Notes                                                             |
| ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `dev`         | `rm -rf .astro && astro sync && astro dev`                          | `NODE_OPTIONS="--max-old-space-size=8192"` (large content)        |
| `build`       | `rm -rf .astro && astro sync && astro build`                        | `dependsOn: ["proto"]`, output to `../../../dist/apps/astro-kbve` |
| `build:osrs`  | `node scripts/generate-osrs-items.mjs && astro sync && astro build` | OSRS content generation + build                                   |
| `preview`     | `astro preview`                                                     | `dependsOn: ["build"]`                                            |
| `check`       | `astro check`                                                       | TypeScript validation                                             |
| `sync`        | `astro sync`                                                        | Content collection sync                                           |
| `proto`       | `buf generate`                                                      | See proto section below                                           |
| `proto:lint`  | `buf lint packages/data/proto`                                      | Lint proto files                                                  |
| `proto:clean` | `rm -rf src/generated/proto && mkdir -p src/generated/proto`        | Clean generated output                                            |

### 1.5 Content Collections

Source: `~/Documents/GitHub/kbve.com/website/astro/src/content/`
Schema source: `~/Documents/GitHub/kbve.com/website/astro/src/content.config.ts`

**Collections defined in content.config.ts:**

| Collection    | Source                                    | Schema                                        | Notes                                                     |
| ------------- | ----------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `docs`        | Starlight default                         | `docsSchema` + `pageSiteGraphSchema` + custom | Extended with `itemdb`, `questdb`, `mapdb`, `osrs` fields |
| `itemdb`      | `./src/content/docs/itemdb/**/*.mdx`      | `IObjectSchema`                               | Game items with 30+ fields                                |
| `questdb`     | `./src/content/docs/questdb/**/*.mdx`     | `IQuestSchema`                                | Quest structure                                           |
| `mapdb`       | `./src/content/docs/mapdb/**/*.mdx`       | `IMapObjectSchema`                            | Map objects                                               |
| `application` | `./src/content/docs/application/**/*.mdx` | (none)                                        | Application docs                                          |
| `project`     | `./src/content/docs/project/**/*.mdx`     | (none)                                        | Project docs                                              |

**Validation:** `validateItemUniqueness()` function ensures `id`, `key`, and `ref` are unique across items.

**Content directory structure** (from `src/content/docs/`):

| Directory      | Count                                                                                                                                                | Source reference                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `guides/`      | varies                                                                                                                                               | `~/kbve.com/website/astro/src/content/docs/guides/`      |
| `application/` | ~39 folders                                                                                                                                          | `~/kbve.com/website/astro/src/content/docs/application/` |
| `journal/`     | ~369 folders                                                                                                                                         | `~/kbve.com/website/astro/src/content/docs/journal/`     |
| `osrs/`        | ~4,511 dirs                                                                                                                                          | `~/kbve.com/website/astro/src/content/docs/osrs/`        |
| `gaming/`      | varies                                                                                                                                               | `~/kbve.com/website/astro/src/content/docs/gaming/`      |
| `arcade/`      | varies                                                                                                                                               | `~/kbve.com/website/astro/src/content/docs/arcade/`      |
| `itemdb/`      | ~69 folders                                                                                                                                          | `~/kbve.com/website/astro/src/content/docs/itemdb/`      |
| `questdb/`     | 4 folders                                                                                                                                            | `~/kbve.com/website/astro/src/content/docs/questdb/`     |
| `mapdb/`       | ~17 folders                                                                                                                                          | `~/kbve.com/website/astro/src/content/docs/mapdb/`       |
| `stock/`       | ~98 folders                                                                                                                                          | `~/kbve.com/website/astro/src/content/docs/stock/`       |
| `crypto/`      | 3 folders                                                                                                                                            | `~/kbve.com/website/astro/src/content/docs/crypto/`      |
| `project/`     | ~17 folders                                                                                                                                          | `~/kbve.com/website/astro/src/content/docs/project/`     |
| `theory/`      | ~9 folders                                                                                                                                           | `~/kbve.com/website/astro/src/content/docs/theory/`      |
| `recipe/`      | 4 folders                                                                                                                                            | `~/kbve.com/website/astro/src/content/docs/recipe/`      |
| `legal/`       | varies                                                                                                                                               | `~/kbve.com/website/astro/src/content/docs/legal/`       |
| `music/`       | varies                                                                                                                                               | `~/kbve.com/website/astro/src/content/docs/music/`       |
| `profile/`     | varies                                                                                                                                               | `~/kbve.com/website/astro/src/content/docs/profile/`     |
| `tools/`       | 3 folders                                                                                                                                            | `~/kbve.com/website/astro/src/content/docs/tools/`       |
| `travel/`      | 3 folders                                                                                                                                            | `~/kbve.com/website/astro/src/content/docs/travel/`      |
| `rareicon/`    | 4 folders                                                                                                                                            | `~/kbve.com/website/astro/src/content/docs/rareicon/`    |
| `webmaster/`   | 3 folders                                                                                                                                            | `~/kbve.com/website/astro/src/content/docs/webmaster/`   |
| Standalone     | `index.mdx`, `404.mdx`, `login.mdx`, `logout.mdx`, `register.mdx`, `settings.mdx`, `chat.mdx`, `discord.mdx`, `github.mdx`, `twitch.mdx`, `yuki.mdx` | Root-level pages                                         |

### 1.6 Components

Source: `~/Documents/GitHub/kbve.com/website/astro/src/components/`

26 component directories (56 `.astro`, 28 `.tsx`, 50 `.ts` files total):

| Directory      | Key files                                                                                                                                                                                   | Rewiring notes                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `navigation/`  | `SiteTitle.astro`, `NavContainer.astro`, `NavDropdown.tsx`, `ReactNav.tsx`                                                                                                                  | Starlight override                     |
| `auth/`        | `AstroLogin.astro`, `AstroLogout.astro`, `AstroRegister.astro`, `ReactAuthLogin.tsx`, `ReactAuthLogout.tsx`, `ReactAuthCallback.tsx`, `AuthBridge.ts`                                       | Rewire → `@kbve/astro` AuthBridge      |
| `footer/`      | `AstroFooter.astro`, `ReactFooter.tsx`, `serviceFooter.ts`                                                                                                                                  | Starlight override                     |
| `pagesidebar/` | `PageSidebar.astro`                                                                                                                                                                         | Starlight override                     |
| `osrs/`        | `OSRSPriceWidget.tsx`, `OSRSCharts.tsx`, `OSRSExternalLinks.tsx`, `OSRSRecipes.astro`, `OSRSDropSources.astro`, `OSRSRelatedItems.astro`, `OSRSItemPanel.astro`, `OSRSEquipmentStats.astro` | Port as-is                             |
| `discord/`     | `DiscordEmbed.astro`, `ReactDiscordEmbed.tsx`, `ReactDiscordProfile.tsx`, `DiscordService.ts`                                                                                               | Port as-is                             |
| `gameserver/`  | `AstroGameServer.astro`, `ReactGameServer.tsx`, `useGS.ts`                                                                                                                                  | Port as-is                             |
| `providers/`   | `SupaProvider.tsx`, `AskamaProvider.astro`, `AskamaObjectIDProvider.astro`, `AskamaOSRSNotFoundProvider.astro`, `AskamaProfileProvider.astro`, `AskamaProfileNotFoundProvider.astro`        | Rewire → `@kbve/droid` SupabaseGateway |
| `realtime/`    | Supabase WebSocket, database listeners                                                                                                                                                      | Rewire → `@kbve/droid` workers         |
| `user/`        | Profile, account management                                                                                                                                                                 | Port, use `@kbve/astro` hooks          |
| `github/`      | GithubHero, contributions display                                                                                                                                                           | Port as-is                             |
| `hero/`        | Landing page heroes, banners                                                                                                                                                                | Port as-is                             |
| `kbve/`        | Logo, featured content, comics                                                                                                                                                              | Port as-is                             |
| `twitch/`      | Stream displays                                                                                                                                                                             | Port as-is                             |
| `itemdb/`      | Item cards, listings                                                                                                                                                                        | Port as-is                             |
| `mapdb/`       | Map displays                                                                                                                                                                                | Port as-is                             |
| `charts/`      | Price charts, analytics                                                                                                                                                                     | Port as-is                             |
| `astropad/`    | Adsense integration                                                                                                                                                                         | Port as-is                             |
| `search/`      | Search components                                                                                                                                                                           | Port as-is                             |
| `redirect/`    | Redirect logic                                                                                                                                                                              | Port as-is                             |
| `unity-react/` | Unity WebGL game integration                                                                                                                                                                | Port as-is                             |
| `vn/`          | `VisualNovelPanel.astro`                                                                                                                                                                    | Port as-is                             |
| `jay/`         | Jay-related components                                                                                                                                                                      | Port as-is                             |
| `utility/`     | Helper components                                                                                                                                                                           | Port as-is                             |

### 1.7 Data Schemas

Source: `~/Documents/GitHub/kbve.com/website/astro/src/data/`

**Schemas** (`src/data/schema/`):

- `IObjectSchema.ts` — Game item schema with 30+ fields (id, key, ref ULID, name, type, category, equipment stats, bonuses, durability, weight, effects, consumable, stackable, rarity, levelRequirement, price, crafting materials, deployable config, scripts)
- `IQuestSchema.ts` — Quest structure
- `IMapSchema.ts` — Map object schema
- `ICraftingSchema.ts` — Crafting requirements
- `IBonusSchema.ts` — Equipment bonuses
- `IDeployableSchema.ts` — Deployable object config
- `IScriptBindingSchema.ts` — Script binding config
- `osrs/` — OSRS-specific schemas (equipment stats, extended item data)

**Types** (`src/data/types/`):

- `ItemCategoryTypes.ts` — `ItemCategoryFlags` enum
- `BonusTypes.ts` — Bonus stat types
- `QuestTypes.ts` — Quest metadata
- `SteamAchievementTypes.ts` — Steam achievements
- `UtilityTypes.ts` — Utility types
- `index.ts` — Re-exports

### 1.8 Libraries

Source: `~/Documents/GitHub/kbve.com/website/astro/src/lib/`

| File/Dir                         | Purpose                          | Rewiring                                   |
| -------------------------------- | -------------------------------- | ------------------------------------------ |
| `gateway/SupabaseGateway.ts`     | Supabase database access         | → `@kbve/droid` SupabaseGateway            |
| `gateway/WorkerPool.ts`          | Web Worker management            | → `@kbve/droid` worker manager             |
| `gateway/WorkerCommunication.ts` | Worker IPC                       | → `@kbve/droid` Comlink-based IPC          |
| `gateway/capabilities.ts`        | Feature detection                | → `@kbve/droid`                            |
| `gateway/strategies/`            | Strategy pattern implementations | → `@kbve/droid`                            |
| `eventEngine.ts`                 | Event pub/sub system             | Evaluate: port or use `@kbve/droid` events |
| `storage.ts`                     | Local storage utilities          | → `@kbve/droid` + `@kbve/khashvault`       |
| `storage-migration.ts`           | Storage version migration        | Port as-is                                 |
| `supa.ts`                        | Supabase client wrapper          | → `@kbve/droid`                            |
| `supabase-shared.ts`             | Shared Supabase utilities        | → `@kbve/droid`                            |
| `utils.ts`                       | General utilities                | Port as-is                                 |

### 1.9 API Routes

Source: `~/Documents/GitHub/kbve.com/website/astro/src/pages/api/`

| Route                        | File                   | Returns                       |
| ---------------------------- | ---------------------- | ----------------------------- |
| `GET /api/applications.json` | `applications.json.ts` | JSON list of application docs |
| `GET /api/projects.json`     | `projects.json.ts`     | JSON list of project docs     |
| `GET /api/itemdb.json`       | `itemdb.json.ts`       | JSON list of game items       |
| `GET /api/questdb.json`      | `questdb.json.ts`      | JSON list of quests           |
| `GET /api/mapdb.json`        | `mapdb.json.ts`        | JSON list of map objects      |
| `GET /api/resources.json`    | `resources.json.ts`    | Resource endpoints            |
| `GET /api/structures.json`   | `structures.json.ts`   | Structure endpoints           |

Note: These are static JSON endpoints built at compile time (Astro static output). Dynamic API routes live in axum-kbve.

### 1.10 Web Workers

Source: `~/Documents/GitHub/kbve.com/website/astro/src/workers/`

| Worker                  | Purpose                           | Rewiring                         |
| ----------------------- | --------------------------------- | -------------------------------- |
| `supabase.db.ts`        | Database queries                  | → `@kbve/droid` DB worker        |
| `supabase.db.simple.ts` | Simplified DB access              | → `@kbve/droid` DB worker        |
| `supabase.websocket.ts` | WebSocket real-time subscriptions | → `@kbve/droid` WebSocket worker |
| `supabase.shared.ts`    | Shared utilities                  | → `@kbve/droid` shared worker    |
| `test-worker.ts`        | Test worker                       | Port or drop                     |

### 1.11 Arcade / Game Engine

Source: `~/Documents/GitHub/kbve.com/website/astro/src/arcade/`

**Runner Game (Phaser-based, ~1,731 lines):**

- `runner/ReactRunnerApp.tsx` — React wrapper for Phaser game
- `runner/RunnerScene.ts` — Game scene configuration
- `runner/AstroRunner.astro` — Astro component for embedding
- `runner/config.ts` — Game constants (colors, dimensions)
- `runner/ecs.ts` — Entity-Component-System framework (uses `bitecs`)
- `runner/sprites.ts` — Sprite management

**ECS Systems:**

- `systems/InputSystem.ts` — Keyboard/gamepad input
- `systems/RapierPhysicsSystem.ts` — Physics simulation
- `systems/AISystem.ts` — Enemy AI
- `systems/NavigationSystem.ts` — Pathfinding
- `systems/ParallaxBackground.ts` — Scrolling background

**Entities:**

- `entities/Knight.ts` — Player character with animations

Rewiring: Use `@kbve/laser` for Phaser/R3F bridge. `bitecs` needs to be added to monorepo root.

### 1.12 Styles

Source: `~/Documents/GitHub/kbve.com/website/astro/src/styles/global.css` (122 lines)

- CSS layers: `base`, `starlight`, `theme`, `components`, `utilities`, `galaxy`, `my-overrides`
- Imports: `@astrojs/starlight-tailwind`, Tailwind theme + utilities
- Theme variables: Cyan/teal accent colors (light: `#06b6d4`, dark: `#a5f3fc`)
- **View transitions:** enabled for smooth page navigation
- Custom components: OSRS price widget, loading spinners, price cards, refresh buttons
- Link styling: Cyan text with hover effects

### 1.13 OSRS Item Generation

Source: `~/Documents/GitHub/kbve.com/website/astro/scripts/generate-osrs-items.mjs`

Script that fetches ~4,500 items from the OSRS Wiki API and generates individual `.mdx` files with equipment stats, drop sources, crafting recipes. Runs as part of `build:osrs` target.

### 1.14 Protobuf Codegen (buf generate)

**buf.gen.yaml** for astro-kbve:

```yaml
version: v2
plugins:
    - remote: buf.build/community/stephenh-ts-proto
      out: src/generated/proto
      opt:
          - useZod=true
          - esModuleInterop=true
          - importSuffix=.js
          - outputServices=false
          - oneof=unions
          - enumsAsLiterals=true
          - stringEnums=true
          - useOptionals=messages
          - useExactTypes=true
          - exportCommonSymbols=true
          - removeEnumPrefix=true
```

Source reference: `~/Documents/GitHub/kbve.com/website/astro/buf.gen.yaml`

**Nx proto target:**

```json
"proto": {
  "executor": "nx:run-commands",
  "inputs": [
    "{workspaceRoot}/packages/data/proto/kbve/*.proto"
  ],
  "outputs": ["{projectRoot}/src/generated/proto"],
  "options": {
    "command": "buf generate packages/data/proto --template apps/kbve/astro-kbve/buf.gen.yaml --path kbve/",
    "cwd": "{workspaceRoot}"
  },
  "cache": true
}
```

Proto source: `packages/data/proto/kbve/` (single source of truth).
Generated output: `src/generated/proto/` → `common.ts`, `enums.ts`, `profile.ts`, `schema.ts`, `snapshot.ts`, `pool.ts`.

kbve.com originally generated from `~/Documents/GitHub/kbve.com/proto/kbve/` which contains the same 6 core files (common, enums, pool, profile, schema, snapshot). The monorepo's `packages/data/proto/kbve/` has 3 additional files (`kbve.proto`, `kbveproto.proto`, `minecraft.proto`) not in the original.

### 1.15 Phases

#### Phase 1 — Scaffold (POC: `nx run astro-kbve:dev` boots clean)

- [ ] Create directory structure
- [ ] Write project.json with all targets (dev, build, build:osrs, preview, check, sync, proto, proto:lint, proto:clean)
- [ ] Write astro.config.mjs with full Starlight config, React, Tailwind, mermaid, site-graph, PWA
- [ ] Write tsconfig.json with strict mode, react-jsx, `@/*`, `@kbve/astro`, `@kbve/droid` path aliases
- [ ] Write tailwind.config.mjs with purple theme (content scan: `./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}`)
- [ ] Write postcss.config.cjs (`@tailwindcss/postcss` + `cssnano`)
- [ ] Create minimal `src/content/docs/index.mdx` homepage
- [ ] Create `src/styles/global.css` with Tailwind layers, cyan/teal theme vars, view transitions
- [ ] Verify dev server starts and renders Starlight landing page

#### Phase 2 — Proto Integration (POC: `nx run astro-kbve:proto` generates valid TypeScript)

- [ ] Write `buf.gen.yaml` with ts-proto plugin config
- [ ] Add proto, proto:lint, proto:clean targets to project.json
- [ ] Run `buf generate`, verify `src/generated/proto/*.ts` output compiles
- [ ] Create `src/schemas/index.ts` barrel export

#### Phase 3 — Content Migration (POC: guide pages render with navigation)

- [ ] Port `content.config.ts` with all collection definitions + `validateItemUniqueness()`
- [ ] Port `src/data/` schema directory (IObjectSchema, IQuestSchema, IMapSchema, ICraftingSchema, IBonusSchema, IDeployableSchema, IScriptBindingSchema)
- [ ] Port `src/data/types/` (ItemCategoryTypes, BonusTypes, QuestTypes, etc.)
- [ ] Migrate `src/content/docs/guides/` as first content batch
- [ ] Migrate Starlight sidebar config (all 15+ autogenerated categories)
- [ ] Verify content collection types resolve

#### Phase 4 — Component Migration (POC: auth flow works end-to-end)

- [ ] Port Starlight overrides: `SiteTitle.astro`, `PageSidebar.astro`, `AstroFooter.astro`
- [ ] Port navigation: `NavContainer.astro`, `NavDropdown.tsx`, `ReactNav.tsx`
- [ ] Port auth components, rewiring `AuthBridge.ts` → `@kbve/astro` AuthBridge
- [ ] Port providers, rewiring `SupaProvider.tsx` → `@kbve/droid` SupabaseGateway
- [ ] Port API routes (`src/pages/api/*.json.ts` — 7 endpoints)
- [ ] Port utility, redirect, search components

#### Phase 5 — Feature Migration (POC: OSRS items + arcade render)

- [ ] Port `scripts/generate-osrs-items.mjs` and `build:osrs` target
- [ ] Migrate OSRS components (`src/components/osrs/` — 8 files)
- [ ] Migrate arcade/game engine (`src/arcade/` — runner, ECS systems, entities) using `@kbve/laser`
- [ ] Migrate Discord, Twitch, GitHub, gameserver components
- [ ] Migrate web workers → `@kbve/droid` worker URLs
- [ ] Port Unity WebGL integration (`src/components/unity-react/`)
- [ ] Port PWA config (`@vite-pwa/astro`)
- [ ] Port chart components (`src/components/charts/`)

#### Phase 6 — Remaining Content (POC: full site parity)

- [ ] Migrate OSRS content (~4,500 item pages — do last, needs `NODE_OPTIONS="--max-old-space-size=8192"`)
- [ ] Migrate journal entries (~369)
- [ ] Migrate application (~39), project (~17), gaming, theory (~9) docs
- [ ] Migrate stock (~98), crypto (3), recipe (4), legal, travel (3) content
- [ ] Migrate itemdb (~69), questdb (4), mapdb (~17) collections
- [ ] Migrate standalone pages (login, logout, register, settings, chat, discord, github, twitch, yuki)
- [ ] Port `public/` assets (images, manifest.json, robots.txt, ads.txt, verification files)
- [ ] Verify sitemap generation covers all routes

---

## 2. astro-kbve-e2e

### 2.1 Directory Structure

Following `memes-e2e` / `astro-e2e` Playwright pattern:

```
apps/kbve/astro-kbve-e2e/
├── project.json
├── playwright.config.ts         Dev mode config (port 4321)
├── playwright.preview.config.ts Preview mode config (port 4322)
├── playwright.docker.config.ts  Docker mode config (port 4323)
├── tsconfig.json
└── e2e/
    ├── smoke.spec.ts            Page load, HTTP status, security headers
    ├── navigation.spec.ts       Sidebar, links, search
    ├── content.spec.ts          Content rendering, collections
    ├── auth.spec.ts             Login/logout/register flows
    ├── api.spec.ts              JSON API endpoint validation
    ├── global-teardown.ts       Cleanup after test runs
    └── helpers/
        └── routes.ts            Route lists for parameterized testing
```

Reference: `astro-e2e` at `packages/npm/astro-e2e/` has three execution modes (dev, preview, static) with different ports and env flags. The `memes-e2e` at `apps/memes/memes-e2e/` has security header testing and sitemap-driven route sampling.

### 2.2 Nx project.json

```json
{
	"name": "astro-kbve-e2e",
	"implicitDependencies": ["astro-kbve"],
	"targets": {
		"e2e": {
			"executor": "@nx/playwright:playwright",
			"cache": false,
			"options": {
				"config": "apps/kbve/astro-kbve-e2e/playwright.config.ts"
			}
		},
		"e2e:preview": {
			"executor": "@nx/playwright:playwright",
			"dependsOn": ["astro-kbve:build"],
			"options": {
				"config": "apps/kbve/astro-kbve-e2e/playwright.preview.config.ts"
			}
		},
		"e2e:docker": {
			"executor": "@nx/playwright:playwright",
			"options": {
				"config": "apps/kbve/astro-kbve-e2e/playwright.docker.config.ts"
			}
		}
	}
}
```

### 2.3 Playwright Config Pattern

```typescript
export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: 'html',
	use: { trace: 'on-first-retry' },
	projects: [
		{
			name: 'dev',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4321',
			},
		},
	],
	webServer: {
		command: 'pnpm nx run astro-kbve:dev',
		cwd: workspaceRoot,
		url: 'http://localhost:4321',
		reuseExistingServer: false,
		timeout: process.env['CI'] ? 600_000 : 120_000,
	},
});
```

### 2.4 Test Coverage Plan

| Test file            | What it validates                                                                                   | Reference                     |
| -------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| `smoke.spec.ts`      | Homepage 200, page title, security headers (X-Frame-Options, X-Content-Type-Options, Cache-Control) | `memes-e2e/e2e/smoke.spec.ts` |
| `navigation.spec.ts` | Sidebar links resolve, no dead links, breadcrumbs                                                   | —                             |
| `content.spec.ts`    | Content pages render expected elements, collections loaded                                          | —                             |
| `auth.spec.ts`       | Login/logout/register form rendering, auth bridge integration                                       | —                             |
| `api.spec.ts`        | JSON endpoints return valid schemas, correct Content-Type                                           | —                             |

### 2.5 Phases

#### Phase 1 — Scaffold (POC: `nx run astro-kbve-e2e:e2e` runs and passes)

- [ ] Create project.json with e2e, e2e:preview, e2e:docker targets
- [ ] Write playwright.config.ts (dev), playwright.preview.config.ts, playwright.docker.config.ts
- [ ] Write tsconfig.json
- [ ] Write `smoke.spec.ts` — homepage loads with 200, title present, security headers validated

#### Phase 2 — Route Coverage (POC: sampled routes return 200)

- [ ] Write `helpers/routes.ts` — route lists from sitemap or hardcoded samples
- [ ] Add `navigation.spec.ts` — sidebar links resolve, no dead links
- [ ] Add `content.spec.ts` — content pages render with expected elements
- [ ] Add `global-teardown.ts` for cleanup

#### Phase 3 — Integration Tests (POC: auth + API flows validated)

- [ ] Add `auth.spec.ts` — login/logout/register form rendering and interaction
- [ ] Add `api.spec.ts` — JSON endpoints return valid data, correct Content-Type headers

---

## 3. axum-kbve

### 3.1 Directory Structure

Following `axum-memes` / `axum-discordsh` pattern, with kbve.com backend features:

Source: `~/Documents/GitHub/kbve.com/website/axum/`

```
apps/kbve/axum-kbve/
├── Cargo.toml                 Crate config (workspace member)
├── project.json               Nx targets: build, serve, docker-build
├── build.rs                   Protobuf compilation (prost-build)
├── Dockerfile                 Multi-stage (Astro + Rust)
├── templates/
│   └── askama/                Server-rendered HTML templates
│       ├── health.html
│       ├── error.html
│       └── profile/
│           ├── index.html
│           └── profile_not_found/index.html
└── src/
    ├── main.rs                Entry point, service init, graceful shutdown
    ├── state.rs               AppState (DB pool, caches, clients)
    ├── astro/
    │   ├── mod.rs             StaticConfig for serving Astro dist
    │   └── askama.rs          Askama template responses
    ├── auth/
    │   ├── mod.rs
    │   └── jwt_cache.rs       Supabase JWT validation + caching
    ├── db/
    │   ├── mod.rs
    │   ├── profile.rs         User profile queries
    │   ├── cache.rs           ProfileCache actor
    │   ├── osrs.rs            OSRS item cache (10k+ items)
    │   ├── discord.rs         Discord enrichment
    │   └── twitch.rs          Twitch status enrichment
    ├── transports/
    │   └── https.rs           Axum router, middleware stack, routes
    └── proto/                 Compiled protobuf modules
```

Source references:

- `~/kbve.com/website/axum/src/main.rs` — initialization sequence
- `~/kbve.com/website/axum/src/transports/https.rs` — router + routes
- `~/kbve.com/website/axum/src/astro/` — static file serving
- `~/kbve.com/website/axum/src/db/` — database layer
- `~/kbve.com/website/axum/src/auth/` — JWT cache
- `~/kbve.com/website/axum/templates/askama/` — HTML templates

### 3.2 Cargo.toml

Source: `~/Documents/GitHub/kbve.com/website/axum/Cargo.toml` (kbve-kbve v1.0.19)

```toml
[package]
name = "axum-kbve"
version = "0.1.0"
edition = "2024"

[dependencies]
# Workspace crates
kbve = { path = "../../../packages/rust/kbve" }
jedi = { path = "../../../packages/rust/jedi" }

# Web framework
axum = { version = "0.8", features = ["macros"] }
axum-extra = { version = "0.12", features = ["typed-header", "protobuf", "query", "caching", "middleware", "routing", "cookie-signed", "file-stream"] }
tokio = { version = "1", features = ["full"] }

# Middleware
tower = "0.5"
tower-http = { version = "0.6", features = ["compression-full", "limit", "trace", "fs", "cors", "set-header"] }

# Database
tokio-postgres = "0.7"
bb8 = "0.9"

# Auth
jsonwebtoken = { version = "10", features = ["use_pem"] }

# Templating (note: kbve.com uses askama 0.13, monorepo standard is 0.15 — template syntax unchanged)
askama = "0.15"

# Proto
prost = "0.13"
tonic = "0.12"
tonic-health = "0.12"
tonic-reflection = "0.12"

# Observability
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Utilities
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dotenvy = "0.15"
anyhow = "1"
socket2 = "0.6"
num_cpus = "1"

[build-dependencies]
prost-build = "0.13"

[features]
default = []
jemalloc = ["dep:tikv-jemallocator"]

[dependencies.tikv-jemallocator]
version = "0.6"
optional = true
```

Add `'apps/kbve/axum-kbve'` to root `Cargo.toml` workspace members.

### 3.3 Nx project.json

```json
{
	"name": "axum-kbve",
	"projectType": "application",
	"targets": {
		"build": {
			"executor": "nx:run-commands",
			"options": {
				"command": "cargo build --release -p axum-kbve",
				"cwd": "{workspaceRoot}"
			}
		},
		"serve": {
			"executor": "nx:run-commands",
			"options": {
				"command": "cargo run -p axum-kbve",
				"cwd": "{workspaceRoot}"
			}
		},
		"docker-build": {
			"executor": "nx:run-commands",
			"dependsOn": ["astro-kbve:build"],
			"options": {
				"command": "docker build -t kbve/kbve:latest -f apps/kbve/axum-kbve/Dockerfile .",
				"cwd": "{workspaceRoot}"
			}
		}
	}
}
```

### 3.4 API Routes (from kbve.com)

Source: `~/Documents/GitHub/kbve.com/website/axum/src/transports/https.rs`

| Method | Route                      | Handler            | Notes                 |
| ------ | -------------------------- | ------------------ | --------------------- |
| GET    | `/health`                  | health check       | Returns 200 + version |
| GET    | `/health.html`             | Askama health page | HTML rendered         |
| GET    | `/api/status`              | API status         | JSON response         |
| GET    | `/api/v1/osrs/{item_id}`   | OSRS item lookup   | Cached item data      |
| GET    | `/api/v1/profile/*`        | Profile data       | Public profile info   |
| POST   | `/api/v1/profile/username` | Username update    | JWT-protected         |
| GET    | `/@{username}`             | Profile page       | Askama SSR            |
| GET    | `/osrs/{item}`             | OSRS static file   | Fallback to static    |

### 3.5 Initialization Sequence

Source: `~/Documents/GitHub/kbve.com/website/axum/src/main.rs`

1. Load `.env` via `dotenvy`
2. Initialize tracing with `EnvFilter`
3. Initialize ProfileService (PostgreSQL via bb8)
4. Start ProfileCache actor (background task)
5. Initialize Discord client (from vault or ENV)
6. Initialize Twitch client (optional)
7. Initialize RentEarth service (optional, game character data)
8. Initialize OSRS cache actor (item mapping + live prices, 10k+ items)
9. Initialize JWT cache (Supabase token validation + cleanup task)
10. Create `TcpListener` with `tuned_listener()` (SO_REUSEPORT via `socket2`)
11. Serve with graceful shutdown

### 3.6 Middleware Stack

Source: `~/Documents/GitHub/kbve.com/website/axum/src/transports/https.rs`

```rust
ServiceBuilder::new()
    .layer(TraceLayer::new_for_http())
    .layer(RequestBodyLimitLayer::new(1024 * 1024))  // 1MB limit
    .layer(CompressionLayer::new())
    .layer(CorsLayer::permissive())  // or configured
    .layer(SetResponseHeaderLayer::...)  // X-Frame-Options, X-Content-Type-Options, etc.
```

### 3.7 Protobuf (build.rs)

Source: `~/Documents/GitHub/kbve.com/website/axum/build.rs`

```rust
fn main() {
    let proto_root = std::env::var("PROTO_ROOT")
        .unwrap_or_else(|_| "../../../packages/data/proto".into());

    prost_build::Config::new()
        .compile_protos(
            &[
                format!("{proto_root}/kbve/common.proto"),
                format!("{proto_root}/kbve/enums.proto"),
                format!("{proto_root}/kbve/schema.proto"),
                format!("{proto_root}/kbve/profile.proto"),
                format!("{proto_root}/kbve/snapshot.proto"),
                format!("{proto_root}/kbve/pool.proto"),
            ],
            &[&proto_root],
        )
        .expect("Failed to compile protos");
}
```

kbve.com's `build.rs` supports Docker path (`/proto/kbve`) and local dev (`../../proto/kbve`). Monorepo version uses `PROTO_ROOT` env var with fallback to relative path.

### 3.8 Environment Variables

Source: `~/Documents/GitHub/kbve.com/.env` (template)

| Variable                                           | Used by                | Required                |
| -------------------------------------------------- | ---------------------- | ----------------------- |
| `SUPABASE_URL`                                     | JWT cache, auth        | Yes                     |
| `SUPABASE_ANON_KEY`                                | Public Supabase client | Yes                     |
| `SUPABASE_SERVICE_ROLE_KEY`                        | Server-side Supabase   | Yes                     |
| `JWT_SECRET`                                       | Token validation       | Yes                     |
| `HTTP_HOST`                                        | Axum listener          | No (default: `0.0.0.0`) |
| `HTTP_PORT`                                        | Axum listener          | No (default: `4321`)    |
| `RUST_LOG`                                         | Tracing filter         | No (default: `info`)    |
| `DEBUG_MODE`                                       | Debug flags            | No                      |
| `GITHUB_TOKEN`                                     | GitHub API             | Optional                |
| `DISCORD_BOT_TOKEN`                                | Discord enrichment     | Optional                |
| `DISCORD_GUILD_ID`                                 | Discord guild          | Optional                |
| `TWITCH_CLIENT_ID`                                 | Twitch API             | Optional                |
| `TWITCH_APP_TOKEN`                                 | Twitch API             | Optional                |
| `PGUSER` / `PGPASSWORD` / `PGDATABASE`             | PostgreSQL             | Yes (for DB features)   |
| `K8S_NAMESPACE` / `K8S_DB_SERVICE` / `K8S_DB_PORT` | K8s service discovery  | Optional (production)   |

### 3.9 Docker Multi-Stage Build

Source: `~/Documents/GitHub/kbve.com/Dockerfile` (7-stage)

| Stage | Base           | Purpose                                                                                         |
| ----- | -------------- | ----------------------------------------------------------------------------------------------- |
| A     | node:24-alpine | Astro build with pnpm, `NODE_OPTIONS="--max-old-space-size=8192"`, precompress assets (gzip -9) |
| B     | rust:1.90-slim | Rust base image                                                                                 |
| C     | (B)            | cargo-chef planner (analyze deps)                                                               |
| D     | (B)            | cargo-chef cook (cache deps)                                                                    |
| E     | (D)            | Build Axum binary, copy Astro output → `templates/dist`, Askama templates → `templates/askama`  |
| F     | ubuntu:24.04   | Chisel minimal rootfs (ca-certificates, libgcc, openssl)                                        |
| G     | ubuntu:24.04   | Extract libjemalloc.so.2                                                                        |
| Z     | scratch        | Final: binary + rootfs + jemalloc. `LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2`      |

Runtime env: `HTTP_HOST=0.0.0.0`, `HTTP_PORT=4321`, `RUST_LOG=info`, jemalloc with tcache tuning.

### 3.10 Phases

#### Phase 1 — Scaffold (POC: `cargo run -p axum-kbve` returns 200 on /health)

- [ ] Create Cargo.toml, add `'apps/kbve/axum-kbve'` to root workspace members
- [ ] Write `main.rs` with tokio, tracing, dotenvy, graceful shutdown, SO_REUSEPORT `tuned_listener()`
- [ ] Write `transports/https.rs` with router + middleware stack (TraceLayer, CompressionLayer, CorsLayer, RequestBodyLimitLayer, security headers)
- [ ] Add `/health` endpoint returning 200 + version
- [ ] Write `project.json` with build/serve/docker-build targets
- [ ] Verify `cargo build -p axum-kbve` compiles clean

#### Phase 2 — Static Serving (POC: Axum serves Astro dist with precompression)

- [ ] Port `astro/mod.rs` StaticConfig from axum-memes pattern (ref: `~/kbve.com/website/axum/src/astro/mod.rs`)
- [ ] Serve `dist/apps/astro-kbve/` as static files via `tower-http::services::ServeDir`
- [ ] Add precompressed `.gz` support
- [ ] Add cache-control headers for static assets (long-lived for hashed, short for HTML)

#### Phase 3 — Askama SSR (POC: `/@username` renders profile page)

- [ ] Port Askama templates from `~/kbve.com/website/axum/templates/askama/` (health, error, profile, profile_not_found)
- [ ] Wire `askama.rs` template rendering (ref: `~/kbve.com/website/axum/src/astro/askama.rs`)
- [ ] Add `/@{username}` route
- [ ] Note: kbve.com uses askama 0.13, monorepo uses 0.15. Template syntax is the same; only Cargo.toml version differs.

#### Phase 4 — Proto + API Routes (POC: `/api/v1/profile/*` returns proto-validated data)

- [ ] Write `build.rs` for prost-build proto compilation (ref: `~/kbve.com/website/axum/build.rs`)
- [ ] Port API routes: `/api/status`, `/api/v1/osrs/{item_id}`, `/api/v1/profile/*`, `POST /api/v1/profile/username`
- [ ] Wire proto types for request/response validation
- [ ] Add gRPC health + reflection services (tonic-health, tonic-reflection)

#### Phase 5 — Database + Auth (POC: JWT-protected endpoints work)

- [ ] Create `state.rs` with `AppState` struct (DB pool, caches, clients)
- [ ] Port DB layer: `profile.rs`, `cache.rs` (ProfileCache actor), `osrs.rs` (OSRS cache) — ref: `~/kbve.com/website/axum/src/db/`
- [ ] Port JWT cache with cleanup task — ref: `~/kbve.com/website/axum/src/auth/jwt_cache.rs`
- [ ] Add auth middleware for protected routes
- [ ] Port Discord enrichment (`db/discord.rs`) — optional
- [ ] Port Twitch enrichment (`db/twitch.rs`) — optional
- [ ] Port RentEarth service — optional

#### Phase 6 — Docker (POC: `docker build` produces working image)

- [ ] Write multi-stage Dockerfile (7-stage: Astro build → cargo-chef → Rust build → chisel rootfs → scratch) — ref: `~/kbve.com/Dockerfile`
- [ ] Add Jemalloc with LD_PRELOAD for production
- [ ] Wire docker-build Nx target with `dependsOn: ["astro-kbve:build"]`
- [ ] Verify container runs: `/health` returns 200, static files served, API routes functional

---

## 4. axum-kbve-e2e

### 4.1 Directory Structure

Following `edge-e2e` (at `apps/kbve/edge-e2e/`) Vitest + Docker pattern:

```
apps/kbve/axum-kbve-e2e/
├── project.json
├── vitest.config.ts
├── tsconfig.json
└── e2e/
    ├── health.spec.ts          Health endpoint validation
    ├── static.spec.ts          Static file serving + compression headers
    ├── api.spec.ts             API route responses + schema validation
    ├── auth.spec.ts            JWT auth flow (accept/reject)
    ├── askama.spec.ts          SSR profile page rendering
    └── helpers/
        ├── http.ts             waitForReady(), BASE_URL, fetch helpers
        └── jwt.ts              Token generation/expiration helpers
```

Reference: `apps/kbve/edge-e2e/` uses Vitest with Docker containers, `waitForReady()` polling, and JWT helpers.

### 4.2 Vitest Config

```typescript
// vitest.config.ts
export default {
	test: {
		include: ['e2e/**/*.spec.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
};
```

### 4.3 Nx project.json

```json
{
	"name": "axum-kbve-e2e",
	"implicitDependencies": ["axum-kbve"],
	"targets": {
		"e2e": {
			"executor": "nx:run-commands",
			"cache": false,
			"options": {
				"commands": [
					"docker rm -f axum-kbve-e2e 2>/dev/null || true",
					"docker run -d --name axum-kbve-e2e -p 4321:4321 -e SUPABASE_URL=$SUPABASE_URL -e SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY -e JWT_SECRET=$JWT_SECRET kbve/kbve:latest",
					"npx vitest run; EC=$?; docker rm -f axum-kbve-e2e 2>/dev/null || true; exit $EC"
				],
				"parallel": false,
				"cwd": "apps/kbve/axum-kbve-e2e"
			}
		}
	}
}
```

### 4.4 Test Coverage Plan

| Test file        | What it validates                                                                              | Reference                     |
| ---------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| `health.spec.ts` | `GET /health` returns 200, version string, response time                                       | `edge-e2e/e2e/health.spec.ts` |
| `static.spec.ts` | Astro dist served with correct Content-Type, Cache-Control, precompressed .gz                  | —                             |
| `api.spec.ts`    | `/api/status` 200, `/api/v1/osrs/{id}` returns valid item, `/api/v1/profile/*` returns profile | —                             |
| `auth.spec.ts`   | Valid JWT accepted, expired JWT rejected, malformed request rejected, missing auth rejected    | `edge-e2e/e2e/auth.spec.ts`   |
| `askama.spec.ts` | `/@{username}` returns HTML with profile data, unknown user returns not-found template         | —                             |

### 4.5 Phases

#### Phase 1 — Scaffold (POC: health check passes against running container)

- [ ] Create project.json with Docker-based e2e target
- [ ] Write vitest.config.ts with 30s test timeout, 60s hook timeout
- [ ] Write tsconfig.json
- [ ] Write `helpers/http.ts` — `waitForReady()` polling, `BASE_URL` config
- [ ] Write `health.spec.ts` — `GET /health` returns 200

#### Phase 2 — Static + API (POC: static files served, API returns valid JSON)

- [ ] Add `static.spec.ts` — verify Astro output served with correct Content-Type, Cache-Control, gzip
- [ ] Add `api.spec.ts` — validate `/api/status`, `/api/v1/osrs/{id}`, `/api/v1/profile/*` responses

#### Phase 3 — Auth + SSR (POC: JWT auth works, Askama profiles render)

- [ ] Write `helpers/jwt.ts` — token generation, expiration helpers
- [ ] Add `auth.spec.ts` — expired tokens rejected, valid tokens accepted, malformed requests handled
- [ ] Add `askama.spec.ts` — `/@{username}` returns HTML, unknown user returns not-found template

---

## 5. Shared Concerns

### 5.1 Protobuf — Single Source of Truth

```
packages/data/proto/kbve/
├── common.proto      Result, shared types
├── enums.proto       Shared enumerations
├── kbve.proto        Service definitions (Health, Echo)
├── kbveproto.proto   DB schema messages
├── minecraft.proto   MC-specific types (not used by astro-kbve/axum-kbve)
├── pool.proto        Connection pool types
├── profile.proto     User profile types
├── schema.proto      Data schema types
└── snapshot.proto    State snapshot types
```

Original source: `~/Documents/GitHub/kbve.com/proto/kbve/` (6 files: common, enums, pool, profile, schema, snapshot).
Monorepo has 3 additional: `kbve.proto` (service defs), `kbveproto.proto` (DB schema), `minecraft.proto`.

**buf.yaml** (module config — needs to be created at `packages/data/proto/buf.yaml` if not present):

```yaml
version: v2
modules:
    - path: .
      name: buf.build/kbve/proto
lint:
    use:
        - STANDARD
    except:
        - PACKAGE_VERSION_SUFFIX
breaking:
    use:
        - FILE
```

Reference: `~/Documents/GitHub/kbve.com/proto/buf.yaml`

**Consumers:**

- **astro-kbve** → `buf generate` → TypeScript + Zod (`src/generated/proto/`)
- **axum-kbve** → `prost-build` (build.rs) → Rust structs (`proto/` module)
- **jedi crate** → tonic-build for gRPC (existing)
- **astro-memes** → inline `proto-to-zod.mjs` (existing, independent)

### 5.2 Missing Dependencies to Install

```bash
pnpm add bitecs
pnpm add -D starlight-theme-galaxy
```

### 5.3 Cargo Workspace Update

Add to root `Cargo.toml`:

```toml
[workspace]
members = [
  # ... existing members ...
  'apps/kbve/axum-kbve',
]
```

### 5.4 Environment Variables

Create `.env.example` in `apps/kbve/axum-kbve/`:

```bash
# Required
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
PGUSER=
PGPASSWORD=
PGDATABASE=

# Optional — server
HTTP_HOST=0.0.0.0
HTTP_PORT=4321
RUST_LOG=info
DEBUG_MODE=false

# Optional — integrations
GITHUB_TOKEN=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
TWITCH_CLIENT_ID=
TWITCH_APP_TOKEN=

# Optional — K8s
K8S_NAMESPACE=
K8S_DB_SERVICE=
K8S_DB_PORT=
```

### 5.5 CI/CD Considerations

- Astro build needs `NODE_OPTIONS="--max-old-space-size=8192"` due to 4,500+ OSRS pages
- Docker build is multi-stage: Astro output feeds into Axum static serving
- E2E tests run against Docker containers in CI
- Proto generation cached by Nx (inputs/outputs tracked)
- OSRS content generation (`build:osrs`) fetches from external Wiki API — CI should cache or pre-generate
- `cargo-chef` in Dockerfile caches Rust dependencies across builds

### 5.6 Content Volume & Migration Order

| Category         | Count  | Migration phase | Notes                                   |
| ---------------- | ------ | --------------- | --------------------------------------- |
| Guides           | varies | Phase 3 (first) | Small, validates pipeline               |
| Applications     | ~39    | Phase 6         |                                         |
| Projects         | ~17    | Phase 6         |                                         |
| Gaming           | varies | Phase 6         |                                         |
| Theory           | ~9     | Phase 6         |                                         |
| ItemDB           | ~69    | Phase 6         | Custom game items                       |
| QuestDB          | 4      | Phase 6         |                                         |
| MapDB            | ~17    | Phase 6         |                                         |
| Stock            | ~98    | Phase 6         | Financial data                          |
| Crypto           | 3      | Phase 6         |                                         |
| Recipe           | 4      | Phase 6         |                                         |
| Legal            | varies | Phase 6         |                                         |
| Travel           | 3      | Phase 6         |                                         |
| Journal          | ~369   | Phase 6         | Blog-style                              |
| OSRS             | ~4,500 | Phase 6 (last)  | Heaviest, needs 8GB Node heap           |
| Standalone pages | 11     | Phase 6         | login, logout, register, settings, etc. |

---

## 6. Migration Checklist (from kbve.com)

### Config Files

- [ ] `astro.config.mjs` — Starlight (title, sidebar, component overrides, plugins, social links, edit link), React, Tailwind, mermaid (forest theme, icon packs), site-graph, PWA, sitemap
    - Source: `~/kbve.com/website/astro/astro.config.mjs`
- [ ] `tsconfig.json` — strict, react-jsx, path aliases (`@/*`, `@kbve/astro`, `@kbve/droid`)
    - Source: `~/kbve.com/website/astro/tsconfig.json`
- [ ] `tailwind.config.mjs` — purple theme (50-950 scale), primary color alias
    - Source: `~/kbve.com/website/astro/tailwind.config.mjs`
- [ ] `postcss.config.cjs` — `@tailwindcss/postcss` + `cssnano`
    - Source: `~/kbve.com/website/astro/postcss.config.cjs`
- [ ] `buf.gen.yaml` — new, pointing at `packages/data/proto/kbve/`
    - Reference: `~/kbve.com/website/astro/buf.gen.yaml`
- [ ] `Cargo.toml` — axum-kbve workspace member
    - Reference: `~/kbve.com/website/axum/Cargo.toml`
- [ ] `Dockerfile` — multi-stage (7-stage)
    - Source: `~/kbve.com/Dockerfile`
- [ ] `scripts/generate-osrs-items.mjs` — OSRS Wiki API item generation
    - Source: `~/kbve.com/website/astro/scripts/generate-osrs-items.mjs`

### Source Directories (astro-kbve)

- [ ] `src/content/` — docs (25+ categories), `content.config.ts` with 6 collections
    - Source: `~/kbve.com/website/astro/src/content/`
- [ ] `src/components/` — 26 directories, 56 `.astro` + 28 `.tsx` + 50 `.ts` files
    - Source: `~/kbve.com/website/astro/src/components/`
- [ ] `src/data/` — 7 schemas + 6 type files
    - Source: `~/kbve.com/website/astro/src/data/`
- [ ] `src/lib/` — gateway system, storage, event engine, Supabase utilities
    - Source: `~/kbve.com/website/astro/src/lib/`
- [ ] `src/pages/api/` — 7 JSON endpoints
    - Source: `~/kbve.com/website/astro/src/pages/api/`
- [ ] `src/styles/global.css` — 122 lines, Tailwind layers, view transitions, OSRS widgets
    - Source: `~/kbve.com/website/astro/src/styles/global.css`
- [ ] `src/workers/` — 5 web workers (Supabase DB, WebSocket, shared)
    - Source: `~/kbve.com/website/astro/src/workers/`
- [ ] `src/arcade/` — Phaser runner game, ECS systems, entities (~1,731 lines)
    - Source: `~/kbve.com/website/astro/src/arcade/`
- [ ] `src/generated/` — regenerated via `buf generate`, NOT copied
- [ ] `public/` — assets, manifest.json, robots.txt, ads.txt, verification files
    - Source: `~/kbve.com/website/astro/public/`

### Source Directories (axum-kbve)

- [ ] `src/main.rs` — init sequence (10 steps)
    - Source: `~/kbve.com/website/axum/src/main.rs`
- [ ] `src/transports/https.rs` — router, middleware, 8 routes
    - Source: `~/kbve.com/website/axum/src/transports/https.rs`
- [ ] `src/astro/` — static file serving + Askama responses
    - Source: `~/kbve.com/website/axum/src/astro/`
- [ ] `src/auth/jwt_cache.rs` — Supabase JWT validation + cleanup
    - Source: `~/kbve.com/website/axum/src/auth/`
- [ ] `src/db/` — profile, cache actor, OSRS cache, Discord, Twitch enrichment
    - Source: `~/kbve.com/website/axum/src/db/`
- [ ] `templates/askama/` — health, error, profile HTML templates
    - Source: `~/kbve.com/website/axum/templates/askama/`
- [ ] `build.rs` — prost-build proto compilation
    - Source: `~/kbve.com/website/axum/build.rs`

### Rewiring to Shared Packages

- [ ] `src/components/auth/AuthBridge.ts` → `@kbve/astro` AuthBridge (`import { AuthBridge } from '@kbve/astro'`)
- [ ] `src/workers/*.ts` → `@kbve/droid` worker URLs (`import { supabaseDbWorkerUrl } from '@kbve/droid'`)
- [ ] `src/lib/gateway/` → `@kbve/droid` SupabaseGateway, WorkerPool, WorkerCommunication
- [ ] Inline state stores → `@kbve/droid` exported stores (`$auth`, `$currentPath`, `$drawerOpen`, `$modalId`, `$activeTooltip`, `$toasts`)
- [ ] `src/lib/supa.ts` + `supabase-shared.ts` → `@kbve/droid` Supabase integration
- [ ] `src/arcade/` game utils → `@kbve/laser` Phaser/R3F bridge
- [ ] `src/lib/storage.ts` → `@kbve/droid` + `@kbve/khashvault` for secure storage
- [ ] Proto path: `../../proto/kbve/` → `packages/data/proto/kbve/` (buf.gen.yaml + build.rs)
- [ ] Askama template paths: adjust for monorepo directory layout
- [ ] `baseUrl` in tsconfig: `"src"` → `"."` (monorepo convention, imports change from `@/foo` to `@/foo` but resolution differs)

---

## 7. Reference Projects (patterns to follow)

These existing monorepo projects serve as implementation references:

| Project           | Path                              | Pattern for                                                        |
| ----------------- | --------------------------------- | ------------------------------------------------------------------ |
| `astro-memes`     | `apps/memes/astro-memes/`         | Astro config, project.json targets, proto codegen, Starlight setup |
| `astro-mc`        | `apps/mc/astro-mc/`               | Astro + React + R3F integration, interactive components            |
| `astro-herbmail`  | `apps/herbmail/astro-herbmail/`   | Simple Starlight docs site                                         |
| `astro-discordsh` | `apps/discordsh/astro-discordsh/` | Starlight + custom components                                      |
| `axum-memes`      | `apps/memes/axum-memes/`          | Axum scaffold, static serving, Askama SSR                          |
| `axum-herbmail`   | `apps/herbmail/axum-herbmail/`    | Minimal Axum + Askama                                              |
| `axum-discordsh`  | `apps/discordsh/axum-discordsh/`  | Axum + Discord bot (Serenity/Poise), Edition 2024                  |
| `irc-gateway`     | `apps/irc/irc-gateway/`           | Axum + WebSocket (tokio-tungstenite), JWT auth                     |
| `memes-e2e`       | `apps/memes/memes-e2e/`           | Playwright E2E: smoke, security headers, sitemap sampling          |
| `edge-e2e`        | `apps/kbve/edge-e2e/`             | Vitest + Docker E2E: health checks, JWT auth testing               |
| `astro-e2e`       | `packages/npm/astro-e2e/`         | Playwright multi-mode (dev/preview/static), component testing      |
| `mc-e2e`          | `apps/mc/mc-e2e/`                 | Vitest + Docker: TCP-level protocol testing                        |

---

## 8. Shared Package API Reference

### @kbve/astro (packages/npm/astro/src/index.ts)

**React hooks:** `useDroid`, `useDroidEvents`, `useToast`, `useTooltip`, `useModal`
**React components:** `DroidProvider`, `DroidStatus`, `ToastContainer`, `ModalOverlay`, `TooltipOverlay`, `CanvasOverlay`
**Auth:** `AuthBridge`, `useAuthBridge`, `bootAuth`, `IDBStorage`
**Icons:** `DiscordIcon`, `GitHubIcon`, `TwitchIcon`
**Astro components:** `DroidProvider.astro`, `DroidStatus.astro`, `AskamaFragment.astro`, `AskamaCard.astro`, `AskamaHero.astro`, `AskamaAlert.astro`, `AskamaSection.astro`, `AskamaStat.astro`, `ToastContainer.astro`, `CanvasOverlay.astro`
**Peer deps:** react >=18, react-dom >=18, astro >=4, @kbve/droid >=0.1, @nanostores/react >=0.7

### @kbve/droid (packages/npm/droid/src/index.ts)

**Core:** `Droid` manager class
**Workers:** canvas worker, DB worker, WebSocket worker, Supabase shared worker, Supabase DB worker (all as `?worker&url` Vite imports)
**State stores (nanostores):** `$auth`, `$currentPath`, `$drawerOpen`, `$modalId`, `$activeTooltip`, `$toasts`
**UI types:** `ToastPayload`, `TooltipPayload`, `ModalPayload`, `VirtualNode`
**Gateway:** `SupabaseGateway`, `OverlayManager`
**Deps:** comlink, nanostores, @nanostores/persistent, dexie, zod, flatbuffers
**Peer deps:** @supabase/supabase-js ^2.95.3 (optional)

### @kbve/laser (packages/npm/laser/src/index.ts)

**Purpose:** Phaser + React Three Fiber integration bridge for React 19
**Peer deps (all optional):** react >=18, react-dom >=18, phaser >=3.80, three >=0.160, @react-three/fiber >=9, @react-three/drei >=10
**No direct deps** — everything is peer

### @kbve/khashvault (packages/npm/khashvault/src/index.ts)

**Purpose:** Browser-side cryptography + secure storage via Web Crypto API + OpenPGP
**Features:** AES-GCM encryption, PGP key management, IndexedDB secure vault
**Deps:** openpgp
**Peer deps:** @kbve/droid >=0.1.0 (optional), comlink >=4.0.0 (optional)

---

## 9. Known Risks & Notes

### Version Discrepancies

- **Askama:** kbve.com uses 0.13, monorepo standard is 0.15. Template syntax is compatible but some attribute syntax changed between versions. Test templates after porting.
- **Rust Edition:** kbve.com uses Edition 2021, monorepo's newer crates (jedi, holy, axum-discordsh) use Edition 2024. Using 2024 for axum-kbve is correct.
- **Vite:** monorepo root has vite 7.3.1 but some plugins (e.g. `@tailwindcss/vite`, `vite-plugin-pwa`) have unmet peer deps for vite ^5/^6. These are warnings only, not blockers.

### Build Considerations

- OSRS content (~4,500 pages) significantly increases Astro build time and memory usage. `NODE_OPTIONS="--max-old-space-size=8192"` is required.
- The `generate-osrs-items.mjs` script fetches from the OSRS Wiki API at build time. CI builds should either cache the generated MDX files or rate-limit API calls.
- `cargo-chef` in the Dockerfile dramatically reduces Rust rebuild times by caching dependency compilation.

### Migration Pitfalls

- `content.config.ts` lives at `src/content.config.ts` (Astro 5 convention, NOT inside `src/content/`).
  Source: `~/kbve.com/website/astro/src/content.config.ts`
- `src/generated/proto/` should be added to `.gitignore` — these files are regenerated by `buf generate`.
- `.astro/` directory should be in `.gitignore` — it's regenerated by `astro sync`.
- `env.d.ts` file needed at `src/env.d.ts` for Astro type definitions:
    ```typescript
    /// <reference types="astro/client" />
    ```
- The `@phaserjs/rapier-connector` dep from kbve.com may need adding if the physics system is used (not currently in monorepo root).
- kbve.com uses `yaml` package for YAML parsing — already available in monorepo root (`yaml@^2.8.2`).
- `@kbve/laser` should be added to tsconfig paths alongside `@kbve/astro` and `@kbve/droid` if arcade components import from it directly.

### Parity Verification

After migration, verify parity by comparing:

1. Route count: generated sitemap should match kbve.com's sitemap
2. Static JSON endpoints: `/api/*.json` output should match
3. Visual spot-check: homepage, OSRS item page, profile page, arcade
4. Lighthouse scores: compare before/after for performance regression
5. Docker image: `/health`, static file serving, API routes all functional
