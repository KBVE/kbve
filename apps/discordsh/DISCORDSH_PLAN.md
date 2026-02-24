# DiscordSH Migration Plan

## Goal

Replace the Python `notification-bot` with the Rust `axum-discordsh` bot, migrating all current functionality and expanding Discord integration with slash commands, embeds, interactive components, and improved architecture.

The Rust bot already has production-grade infrastructure (Axum HTTP server, Docker multi-stage build, Supabase Vault integration, security headers, static asset serving). What it lacks is Discord feature parity with the Python bot.

---

## Current State

### axum-discordsh (Rust) — What Exists

- **Poise 0.6.1** slash command framework on **Serenity 0.12.5**, Rust edition 2024
- Slash commands: `/ping`, `/status` (rich embed + buttons), `/health` (rich health embed), `/restart`, `/cleanup`
- `StatusState` enum with 5 lifecycle states, color/emoji/thumbnail properties
- Status embed with guild count, shard info, uptime, health metrics, interactive buttons (Refresh, Cleanup, Restart)
- `HealthMonitor` with background 60s polling via `sysinfo` 0.38.2 — CPU, memory, threads, process metrics
- Health thresholds: Healthy (≤70%), Warning (70-90%), Critical (>90%) with color-coded embeds
- Central `AppState` shared between HTTP server and Discord bot (lifecycle control, shard management)
- `ShardTracker` backed by Supabase PostgREST for distributed shard management
- HTTP API: `/health`, `/healthz`, `/bot-restart`, `/sign-off`, `/cleanup-thread`, `/tracker-status`
- Bot restart loop in `main.rs` with `AtomicBool` restart flag + `ShardManager` shutdown
- Configurable sharding: single (default), distributed (`SHARD_ID`/`SHARD_COUNT`), auto-scaling (`USE_AUTO_SCALING`)
- Expanded event handler: Ready (tracker + 30s heartbeat), GuildCreate, GuildDelete, InteractionCreate
- Global `event_handler` routing component interactions by `custom_id` prefix
- Token resolution from env or Supabase Vault
- Axum HTTP server with security headers, CORS, compression, load shedding
- Static file serving (Astro frontend)
- Docker multi-stage build with jemalloc
- Internal crate dependencies: `kbve` (Supabase), `jedi`, `reqwest` 0.13.2

### notification-bot (Python) — What Must Be Migrated

| Feature Area          | Status   | Details                                                                                     |
| --------------------- | -------- | ------------------------------------------------------------------------------------------- |
| **Bot lifecycle**     | ✅ Done  | Start, stop, restart, sign-off via HTTP API + slash commands                                |
| **Slash commands**    | ✅ Done  | `/ping`, `/status`, `/health`, `/restart`, `/cleanup`                                       |
| **Status embeds**     | ✅ Done  | Rich embed with health metrics, shard info, interactive buttons (Refresh, Cleanup, Restart) |
| **Health monitoring** | ✅ Done  | CPU, memory, threads, uptime, process info with HEALTHY/WARNING/CRITICAL thresholds         |
| **Supabase tracker**  | ✅ Done  | Distributed shard assignment, heartbeat, cluster status, stale shard cleanup                |
| **Supabase vault**    | ✅ Done  | Secret retrieval via Edge Function (shared with Python bot)                                 |
| **User management**   | Deferred | Discord ID lookup, multi-provider linking — only needed for user-facing commands            |
| **Thread cleanup**    | ✅ Done  | Delete old bot messages from a status thread (HTTP + slash command + button)                |
| **Sharding**          | ✅ Done  | Single, distributed, and auto-scaling modes                                                 |
| **DI framework**      | N/A      | Rust uses `Arc<AppState>` instead of Dishka DI — simpler, zero-cost                         |

---

## Phase 1: Slash Command Framework ✅

> **Completed** — PR #7216 merged to `dev`.

Migrated from Serenity raw `EventHandler` to the **poise 0.6.1** framework (serenity 0.12.5).

- Replaced `struct Handler` / `impl EventHandler` with `poise::Framework::builder()`
- `Data` struct holds shared state, `Error` and `Context` type aliases
- Guild-scoped command registration via `GUILD_ID` env var (dev), global registration otherwise
- Three slash commands: `/ping`, `/status`, `/health`
- `commands::all()` aggregates all commands for framework registration
- Intents changed from `GUILD_MESSAGES | MESSAGE_CONTENT` to `non_privileged()`

---

## Phase 2: Embeds and Interactive Components ✅

> **Completed** — Ported `BotStatusView` embed system to Rust.

### What Was Built

**`src/discord/embeds/`** — Decoupled embed construction:

- `StatusState` enum (5 variants: Online, Offline, Starting, Stopping, Error) with `color()`, `emoji()`, `label()`, `thumbnail_url()` methods
- `StatusSnapshot` struct — plain data bag decoupled from poise's `Data`
- `build_status_embed(&StatusSnapshot) -> CreateEmbed` — pure function, no async, no side effects
- `format_uptime(Duration) -> String` — "2d 5h 32m 10s" formatting

**`src/discord/components/`** — Button row and interaction handling:

- Three buttons: **Refresh** (Primary), **Cleanup** (Secondary), **Restart** (Danger)
- Custom IDs: `status_refresh`, `status_cleanup`, `status_restart`
- **Refresh** rebuilds the embed and edits in-place via `CreateInteractionResponse::UpdateMessage`
- **Cleanup** deletes bot's own messages from configured status thread
- **Restart** checks `member.permissions.administrator()`, rejects non-admins, triggers shard shutdown + restart

**`src/discord/bot.rs`** — Updated:

- `Data { app: Arc<AppState> }` wrapping central shared state
- Global `event_handler` routes component interactions by `custom_id` prefix (`"status_"`)
- Uses poise's `FrameworkOptions::event_handler` for persistent buttons (survive bot restarts)

**`src/discord/commands/status.rs`** — Updated:

- Builds `StatusSnapshot` from `ctx.data()`, `ctx.cache().guild_count()`, shard ID
- Sends embed + button row via `poise::CreateReply`

### Deferred Items

- ~~CPU/memory/thread metrics (requires `sysinfo` crate — Phase 3)~~ ✅ Done
- ~~Health thresholds and health-based color override (Phase 3)~~ ✅ Done
- ~~Actual Cleanup thread deletion logic (Phase 4/5)~~ ✅ Done
- ~~Actual Restart process signal logic (Phase 4)~~ ✅ Done
- Shard latency display (future enhancement)

---

## Phase 3: Health Monitoring ✅

> **Completed** — PR #7223 merged to `dev`.

### What Was Built

**`src/health/mod.rs`** — Real-time system metrics with `sysinfo` 0.38.2:

- `HealthMonitor` struct with persistent `RwLock<System>` for accurate CPU deltas
- Background `tokio::spawn` task: 1s warmup, then 60s interval refreshes
- `snapshot()` — read lock, clone cached data (cheap)
- `force_refresh()` — immediate refresh (wired to Refresh button)
- `spawn_background_task()` — starts the background polling loop

**`HealthSnapshot`** (Clone + Serialize):

- `memory_usage_mb`, `memory_percent`, `system_memory_total_gb`, `system_memory_used_percent`
- `cpu_percent` (global CPU %)
- `thread_count` (Linux-only via `process.tasks()`, 0 on other platforms)
- `pid`, `uptime_seconds`, `uptime_formatted`
- `health_status: HealthStatus` — Healthy/Warning/Critical
- `memory_bar(width) -> String` — emoji progress bar (green/orange/red based on level)

**`HealthStatus` enum** — Healthy (≤70%), Warning (70-90%), Critical (>90%):

- `from_usage(memory_percent, cpu_percent)` — threshold classification
- `color_override()` — None for Healthy (use state color), orange for Warning, red for Critical
- `emoji()` — green/yellow/red circle

**Wiring:**

- `Arc<HealthMonitor>` created in `main.rs`, shared via `AppState`
- HTTP `/health` returns JSON with full system metrics (`{"status": "ok", "health": {...}}`)
- `/status` embed gains conditional Memory, CPU, Threads, Health fields
- `/health` slash command shows rich embed with all metrics + color-coded thresholds
- Refresh button calls `force_refresh()` before re-rendering

**Tests:** 5 unit tests (health_status thresholds, memory_bar, round2 precision)

---

## Phase 4: HTTP API Endpoints ✅

> **Completed** — PR #7226 merged to `dev`.

### What Was Built

**`src/state.rs`** — Central `AppState` shared between HTTP server and Discord bot:

- `health_monitor: Arc<HealthMonitor>` — system metrics
- `tracker: Option<ShardTracker>` — Supabase shard coordination (optional)
- `start_time: Instant` — for uptime tracking
- `shutdown_notify: Notify` — cross-subsystem graceful shutdown
- `restart_flag: AtomicBool` — HTTP/button → bot restart signal
- `shard_manager: RwLock<Option<Arc<ShardManager>>>` — lifecycle control
- `bot_http: RwLock<Option<Arc<Http>>>` — serenity HTTP client for API calls

**`src/transport/https.rs`** — 6 HTTP endpoints:

| Method | Path              | Purpose                                    |
| ------ | ----------------- | ------------------------------------------ |
| `GET`  | `/health`         | Full health JSON with system metrics       |
| `GET`  | `/healthz`        | Simple liveness probe (200 "ok")           |
| `POST` | `/bot-restart`    | Set restart flag + shutdown shards         |
| `POST` | `/sign-off`       | Graceful process shutdown                  |
| `POST` | `/cleanup-thread` | Delete bot messages from DISCORD_THREAD_ID |
| `GET`  | `/tracker-status` | Query cluster shard status from Supabase   |

**`src/main.rs`** — Bot restart loop:

- HTTP server spawned once, runs for process lifetime
- Bot runs in a loop; on exit, checks `restart_flag` to restart or break
- `tokio::select!` handles restart, shutdown notify, and Ctrl+C

**Tests:** 2 new HTTP endpoint tests (healthz, tracker_status)

---

## Phase 5: Supabase Shard Tracker ✅

> **Completed** — PR #7226 merged to `dev`.

### What Was Built

**`src/tracker/mod.rs`** — `ShardTracker` backed by Supabase PostgREST:

- Uses `tracker.cluster_management` table via `Content-Profile: tracker` header
- Own `reqwest::Client` (kbve `SupabaseClient` lacks non-default schema support)
- `from_env()` — optional, reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- `record_shard()` — upsert on Ready event
- `update_heartbeat()` — PATCH every 30s from spawned heartbeat task
- `cleanup_assignment()` — mark instance inactive on shutdown
- `get_cluster_status()` — query active shards for `/tracker-status` endpoint
- `cleanup_stale()` — RPC call to clean stale assignments

All operations are best-effort — errors logged but never crash the bot.

**Tests:** 3 unit tests (ShardRecord deserialization, null handling, from_env safety)

---

## Phase 6: Sharding Support ✅

> **Completed** — PR #7226 merged to `dev`.

Three sharding modes configured via environment variables:

| Mode             | Env Vars                                     | Behavior                                                  |
| ---------------- | -------------------------------------------- | --------------------------------------------------------- |
| Single (default) | None                                         | `client.start()` — one shard                              |
| Distributed      | `SHARD_ID` + `SHARD_COUNT`                   | `client.start_shard(id, count)` — one shard per container |
| Auto-scaling     | `USE_AUTO_SCALING` + optional `TOTAL_SHARDS` | `client.start_shards(total)` — multiple shards            |

Shard manager stored in `AppState` for HTTP/button-triggered shutdown and restart.

---

## Phase 7: Event Handlers ✅

> **Completed** — PR #7226 merged to `dev`.

Event handler embedded in `bot.rs` (not a separate `events.rs` — kept simple):

| Event               | Behavior                                                    |
| ------------------- | ----------------------------------------------------------- |
| `Ready`             | Log shard info, record in tracker, spawn 30s heartbeat task |
| `GuildCreate`       | Log new guild joins (`is_new` check)                        |
| `GuildDelete`       | Log guild departures                                        |
| `InteractionCreate` | Route component interactions by `custom_id` prefix          |

---

## Source Layout

Files marked with ✅ exist and are implemented.

```
apps/discordsh/axum-discordsh/src/
├── main.rs                        ✅ Entry point, tokio runtime, bot restart loop
├── state.rs                       ✅ AppState — central shared state (Phase 4)
├── discord/
│   ├── mod.rs                     ✅ Module declarations (bot, commands, embeds, components)
│   ├── bot.rs                     ✅ Poise framework, Data struct, event_handler, sharding
│   ├── commands/
│   │   ├── mod.rs                 ✅ Command registration (all())
│   │   ├── ping.rs                ✅ /ping
│   │   ├── status.rs              ✅ /status (embed + buttons)
│   │   ├── health.rs              ✅ /health (rich health embed)
│   │   └── admin.rs               ✅ /restart, /cleanup (admin commands)
│   ├── embeds/
│   │   ├── mod.rs                 ✅ Re-exports
│   │   ├── status_state.rs        ✅ StatusState enum (5 variants)
│   │   └── status_embed.rs        ✅ StatusSnapshot + build_status_embed()
│   └── components/
│       ├── mod.rs                 ✅ Re-exports
│       └── status_buttons.rs      ✅ Button row + interaction handler (Refresh, Cleanup, Restart)
├── health/
│   └── mod.rs                     ✅ HealthMonitor, HealthSnapshot, HealthStatus (Phase 3)
├── tracker/
│   └── mod.rs                     ✅ ShardTracker, ShardRecord — Supabase PostgREST (Phase 5)
├── transport/
│   ├── mod.rs                     ✅
│   └── https.rs                   ✅ Axum HTTP server + 6 API routes (Phase 4)
└── astro/
    ├── mod.rs                     ✅
    └── askama.rs                  ✅ Static file serving
```

---

## Execution Order

| Step | Phase | What                                                      | Risk | Status  |
| ---- | ----- | --------------------------------------------------------- | ---- | ------- |
| 1    | 1     | Add `poise` dependency, scaffold command module           | Low  | ✅ Done |
| 2    | 1     | Migrate `!ping` to `/ping` slash command                  | Low  | ✅ Done |
| 3    | 1     | Add `/status` and `/health` commands (text-only first)    | Low  | ✅ Done |
| 4    | 2     | Build status embed with `StatusState` and buttons         | Med  | ✅ Done |
| 5    | 2     | Add interactive button handling (Refresh/Cleanup/Restart) | Med  | ✅ Done |
| 6    | 3     | Add `sysinfo` dependency, implement HealthMonitor         | Low  | ✅ Done |
| 7    | —     | Add admin commands (`/restart`, `/cleanup`)               | Med  | ✅ Done |
| 8    | 4     | Central AppState + HTTP API endpoints                     | Low  | ✅ Done |
| 9    | 5     | Supabase ShardTracker integration                         | Med  | ✅ Done |
| 10   | 6     | Configurable sharding support                             | High | ✅ Done |
| 11   | 7     | Expanded event handlers                                   | Low  | ✅ Done |
| 12   | —     | Integration testing, Docker verification                  | Med  | ✅ Done |
| 13   | —     | Deprecate notification-bot, update CI                     | Low  | ✅ Done |

---

## Phase 8: Integration Testing & CI Deprecation ✅

> **Completed** — Steps 12 and 13.

### Step 12: Integration Testing & Docker Verification

**E2E test fix** (`discordsh-e2e/e2e/smoke.spec.ts`):

- Fixed `/health` test to parse JSON response (`json.status === "ok"`) instead of expecting plain text `"OK"`
- Added `/healthz` plain-text liveness probe test
- Added `Content-Type: application/json` assertion on `/health`

**Rust integration tests** (`src/transport/https.rs`):

- Expanded `test_router()` to include all 6 HTTP endpoints (was 3 GET-only)
- Refactored to return `(Router, Arc<AppState>)` so tests can verify state mutations
- `test_bot_restart_sets_flag` — POST `/bot-restart` sets restart flag, returns success JSON
- `test_sign_off_returns_ok` — POST `/sign-off` returns shutdown-initiated JSON
- `test_cleanup_thread_no_env` — POST `/cleanup-thread` returns error when `DISCORD_THREAD_ID` unset

**Test count:** 29 Rust unit/integration tests (was 26).

**Docker:** No changes needed — 9-stage Dockerfile with cargo-chef, jemalloc, scratch runtime is production-ready.

### Step 13: Deprecate notification-bot, Update CI

- Removed `notification-bot` entry from `generate_docker_matrix` in `ci-main.yml`
- Removed `notification_bot` output from `utils-file-alterations.yml` (declaration, mapping, and trigger)
- Kept `apps/discordsh/notification-bot/` directory as archive (not deleted)
- `discordsh` file alteration trigger (`apps/discordsh/**`) already subsumes notification-bot path

---

## Deprecation Plan for notification-bot ✅

> **Completed** — notification-bot removed from CI pipelines.

1. ~~Run both bots in parallel with the Python bot in read-only mode~~ Skipped — Rust bot verified via E2E
2. ~~Verify Rust bot handles all slash commands and embeds correctly~~ ✅ Done
3. ~~Update CI/CD pipelines to remove notification-bot build/deploy~~ ✅ Done
4. `apps/discordsh/notification-bot/` kept as archive for reference
5. ~~Update Nx project configuration~~ Not needed — Nx targets only run when explicitly invoked

---

## Key Differences from Python Bot

| Aspect            | Python (notification-bot)                | Rust (axum-discordsh)         |
| ----------------- | ---------------------------------------- | ----------------------------- |
| Framework         | discord.py + FastAPI + Dishka DI         | serenity + poise + Axum       |
| Commands          | HTTP POST endpoints (not slash commands) | Native Discord slash commands |
| Health monitoring | psutil via HealthMonitor class           | sysinfo crate                 |
| Sharding          | discord.py AutoShardedClient             | Serenity built-in sharding    |
| Static assets     | None                                     | Astro frontend served by Axum |
| Response format   | TypedDict + orjson                       | serde + serde_json            |
| Memory allocator  | Python GC                                | jemalloc (production)         |
| Token source      | Vault Edge Function or env               | Same (shared vault ID)        |
| Rust edition      | N/A                                      | 2024                          |

---

## Deferred to Future Work

- **User management** — Discord ID lookup, multi-provider linking (only needed for user-facing commands)
- **Shard latency display** — Per-shard latency in status embed
- **`/bot-online` / `/bot-offline`** — Explicit online/offline toggle (bot auto-starts)
- **Runtime sharding toggle** — Sharding mode set via env vars at startup
