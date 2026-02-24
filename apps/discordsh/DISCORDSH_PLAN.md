# DiscordSH Migration Plan

## Goal

Replace the Python `notification-bot` with the Rust `axum-discordsh` bot, migrating all current functionality and expanding Discord integration with slash commands, embeds, interactive components, and improved architecture.

The Rust bot already has production-grade infrastructure (Axum HTTP server, Docker multi-stage build, Supabase Vault integration, security headers, static asset serving). What it lacks is Discord feature parity with the Python bot.

---

## Current State

### axum-discordsh (Rust) — What Exists

- **Poise 0.6.1** slash command framework on **Serenity 0.12.5** (Phase 1 complete)
- Slash commands: `/ping`, `/status` (rich embed + buttons), `/health`
- `StatusState` enum with 5 lifecycle states, color/emoji/thumbnail properties
- Status embed with guild count, shard info, uptime, interactive buttons (Refresh, Cleanup stub, Restart stub)
- Global `event_handler` routing component interactions by `custom_id` prefix
- Token resolution from env or Supabase Vault
- Axum HTTP server with `/health` endpoint
- Static file serving (Astro frontend)
- Security headers, CORS, compression, load shedding
- Docker multi-stage build with jemalloc
- Internal crate dependencies: `kbve` (Supabase), `jedi`

### notification-bot (Python) — What Must Be Migrated

| Feature Area          | Details                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **Bot lifecycle**     | Start, stop, restart, force-restart, sign-off via HTTP API                                   |
| **Slash commands**    | Not yet slash commands — exposed as FastAPI POST endpoints called externally                 |
| **Status embeds**     | Rich embed with health metrics, shard info, interactive buttons (Refresh, Cleanup, Restart)  |
| **Health monitoring** | CPU, memory, threads, uptime, process info with HEALTHY/WARNING/CRITICAL thresholds          |
| **Supabase tracker**  | Distributed shard assignment, heartbeat, cluster status, stale shard cleanup                 |
| **Supabase vault**    | Secret retrieval via Edge Function (already shared with Rust bot)                            |
| **User management**   | Discord ID lookup, multi-provider linking (Discord, GitHub, Google), sync from auth metadata |
| **Thread cleanup**    | Delete old bot messages from a status thread                                                 |
| **Sharding**          | Auto-sharding and distributed sharding (one shard per container)                             |
| **DI framework**      | Dishka container with scoped providers                                                       |

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
- **Cleanup** responds with ephemeral stub (actual logic deferred to Phase 4/5)
- **Restart** checks `member.permissions.administrator()`, rejects non-admins, responds with ephemeral stub

**`src/discord/bot.rs`** — Updated:

- `Data { start_time: Instant }` for uptime tracking
- Global `event_handler` routes component interactions by `custom_id` prefix (`"status_"`)
- Uses poise's `FrameworkOptions::event_handler` for persistent buttons (survive bot restarts)

**`src/discord/commands/status.rs`** — Updated:

- Builds `StatusSnapshot` from `ctx.data()`, `ctx.cache().guild_count()`, shard ID
- Sends embed + button row via `poise::CreateReply`

### Deferred to Phase 3+

- CPU/memory/thread metrics (requires `sysinfo` crate — Phase 3)
- Health thresholds and health-based color override (Phase 3)
- Actual Cleanup thread deletion logic (Phase 4/5)
- Actual Restart process signal logic (Phase 4)
- Shard latency display (Phase 7)

---

## Phase 3: Health Monitoring

Port the Python `HealthMonitor` to Rust with lower overhead.

### Dependencies

```toml
[dependencies]
sysinfo = "0.35"   # Cross-platform system info (CPU, memory, processes)
```

### Design

```
src/health/
├── mod.rs          # HealthMonitor struct with cached metrics
└── metrics.rs      # Metric collection and thresholds
```

- Background `tokio::spawn` task that refreshes metrics on interval (configurable, default 60s)
- Shared state via `Arc<RwLock<HealthSnapshot>>`
- Thresholds: HEALTHY (<70%), WARNING (70-90%), CRITICAL (>90%) for memory and CPU
- Expose via both HTTP `/health` endpoint (JSON) and `/status` slash command (embed)

### HealthSnapshot Fields

```rust
pub struct HealthSnapshot {
    pub memory_usage_mb: f64,
    pub memory_percent: f64,
    pub cpu_percent: f64,
    pub uptime_seconds: u64,
    pub uptime_formatted: String,
    pub thread_count: usize,
    pub system_memory_total_gb: f64,
    pub system_memory_used_percent: f64,
    pub health_status: HealthStatus, // Healthy | Warning | Critical
    pub pid: u32,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}
```

---

## Phase 4: HTTP API Endpoints

Maintain HTTP API compatibility for external orchestration (Kubernetes probes, CI/CD triggers).

### Endpoints to Migrate

| Method | Path                 | Purpose                                   | Priority |
| ------ | -------------------- | ----------------------------------------- | -------- |
| `GET`  | `/health`            | Full health JSON (already exists, expand) | High     |
| `GET`  | `/healthz`           | Simple liveness probe (200 OK)            | High     |
| `POST` | `/bot-online`        | Bring bot online                          | Medium   |
| `POST` | `/bot-offline`       | Take bot offline                          | Medium   |
| `POST` | `/bot-restart`       | Restart bot                               | Medium   |
| `POST` | `/bot-force-restart` | Force restart                             | Medium   |
| `POST` | `/sign-off`          | Graceful shutdown                         | Medium   |
| `GET`  | `/tracker-status`    | Cluster/shard status                      | Low      |
| `POST` | `/cleanup-thread`    | Clean status thread messages              | Low      |

### Implementation

- Add Axum routes in `src/transport/https.rs` alongside existing static file routes
- Share bot state via Axum `State` extractor (Arc-wrapped)
- Return generic error messages (no raw exception text — apply the same security pattern from the Python fix)
- Use `tracing::error!` for server-side exception logging

---

## Phase 5: Supabase Integration

Expand the existing `kbve` crate's Supabase support.

### Vault (Already Working)

- Token resolution from vault is implemented
- Extend to support additional secrets as needed

### Tracker (Shard Coordination)

Port the distributed shard tracker for multi-instance deployments:

- Shard assignment via Supabase RPC or direct table operations
- Heartbeat updates on interval
- Stale shard cleanup
- Cluster status queries

### User Management (Future)

Port the user lookup and provider linking functionality:

- Discord ID → user profile lookup via RPC
- Multi-provider relationship queries
- Provider sync from auth metadata

This is lower priority — only needed if the bot adds user-facing commands beyond status/health.

---

## Phase 6: Sharding Support

### Auto-Sharding (Default)

- Serenity's `Client::builder` with default sharding (Discord recommends shard count)
- Track per-shard metrics (latency, guild count, connection state)

### Distributed Sharding (Kubernetes)

- Environment variables: `SHARD_ID`, `SHARD_COUNT`, `TOTAL_SHARDS`, `CLUSTER_NAME`
- One shard per container instance
- Supabase tracker for shard coordination (Phase 5)
- Graceful shard handoff on shutdown

---

## Phase 7: Event Handlers

Expand beyond the basic `ready` handler:

| Event                | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `ready`              | Log connection, record shard info, send status embed |
| `shard_ready`        | Per-shard tracking and heartbeat                     |
| `shard_disconnect`   | Update tracker, log reconnection                     |
| `shard_resumed`      | Log session resume                                   |
| `guild_create`       | Track new guild joins                                |
| `guild_delete`       | Track guild departures                               |
| `interaction_create` | Handle button/component interactions                 |

---

## Source Layout

Files marked with ✅ exist and are implemented.

```
apps/discordsh/axum-discordsh/src/
├── main.rs                        ✅ Entry point, tokio runtime
├── discord/
│   ├── mod.rs                     ✅ Module declarations (bot, commands, embeds, components)
│   ├── bot.rs                     ✅ Poise framework setup, Data struct, event_handler
│   ├── commands/
│   │   ├── mod.rs                 ✅ Command registration (all())
│   │   ├── ping.rs                ✅ /ping
│   │   ├── status.rs              ✅ /status (embed + buttons)
│   │   ├── health.rs              ✅ /health (text placeholder — Phase 3)
│   │   └── admin.rs               /restart, /force-restart, /cleanup
│   ├── embeds/
│   │   ├── mod.rs                 ✅ Re-exports
│   │   ├── status_state.rs        ✅ StatusState enum (5 variants)
│   │   └── status_embed.rs        ✅ StatusSnapshot + build_status_embed()
│   ├── components/
│   │   ├── mod.rs                 ✅ Re-exports
│   │   └── status_buttons.rs      ✅ Button row + interaction handler
│   └── events.rs                  Shard/guild event handlers (Phase 7)
├── health/
│   ├── mod.rs                     HealthMonitor (Phase 3)
│   └── metrics.rs                 Metric collection (Phase 3)
├── tracker/
│   ├── mod.rs                     Shard tracker — Supabase (Phase 5)
│   └── shard.rs                   Shard assignment logic (Phase 5)
├── transport/
│   ├── mod.rs                     ✅
│   └── https.rs                   ✅ Axum HTTP server + API routes
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
| 6    | 3     | Add `sysinfo` dependency, implement HealthMonitor         | Low  | Next    |
| 7    | 1     | Add admin commands (`/restart`, `/cleanup`)               | Med  | Pending |
| 8    | 4     | Expand HTTP API endpoints                                 | Low  | Pending |
| 9    | 5     | Expand Supabase tracker integration                       | Med  | Pending |
| 10   | 6     | Add distributed sharding support                          | High | Pending |
| 11   | 7     | Expand event handlers                                     | Low  | Pending |
| 12   | —     | Integration testing, Docker verification                  | Med  | Pending |
| 13   | —     | Deprecate notification-bot, update CI                     | Low  | Pending |

---

## Deprecation Plan for notification-bot

Once the Rust bot reaches feature parity:

1. Run both bots in parallel with the Python bot in read-only mode (no writes to tracker)
2. Verify Rust bot handles all slash commands and embeds correctly
3. Update CI/CD pipelines to remove notification-bot build/deploy
4. Remove `apps/discordsh/notification-bot/` directory
5. Update Nx project configuration

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
