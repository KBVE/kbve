# DiscordSH Migration Plan

## Goal

Replace the Python `notification-bot` with the Rust `axum-discordsh` bot, migrating all current functionality and expanding Discord integration with slash commands, embeds, interactive components, and improved architecture.

The Rust bot already has production-grade infrastructure (Axum HTTP server, Docker multi-stage build, Supabase Vault integration, security headers, static asset serving). What it lacks is Discord feature parity with the Python bot.

---

## Current State

### axum-discordsh (Rust) — What Exists

- Serenity 0.12 with basic `EventHandler` (message + ready events)
- Single `!ping` text command
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

## Phase 1: Slash Command Framework

Migrate from Serenity raw `EventHandler` to the `poise` framework for ergonomic slash command support.

### Dependencies

```toml
[dependencies]
poise = "0.6"  # Built on serenity 0.12, adds slash command framework
```

### Command Module Structure

```
src/discord/
├── mod.rs              # Discord module root
├── bot.rs              # Bot startup, token resolution, client builder
├── commands/
│   ├── mod.rs          # Command registration
│   ├── ping.rs         # /ping — basic connectivity check
│   ├── status.rs       # /status — bot status embed with health metrics
│   ├── health.rs       # /health — detailed health report
│   └── admin.rs        # /restart, /force-restart — admin-only commands
└── events.rs           # Event handlers (ready, shard_ready, etc.)
```

### Implementation

- Define a `Data` struct holding shared state (Supabase client, health monitor, bot metadata)
- Register commands via `poise::Framework::builder().options(poise::FrameworkOptions { commands: vec![...] })`
- Use `#[poise::command(slash_command)]` attribute for each command
- Guild-scoped commands for fast registration during development, global commands for production
- Permission checks via `#[poise::command(required_permissions = "ADMINISTRATOR")]` for admin commands

### Commands to Implement

| Command          | Description                                  | Permissions |
| ---------------- | -------------------------------------------- | ----------- |
| `/ping`          | Responds with latency                        | Everyone    |
| `/status`        | Shows bot status embed with health data      | Everyone    |
| `/health`        | Detailed system health (CPU, memory, uptime) | Everyone    |
| `/restart`       | Restart the bot gracefully                   | Admin       |
| `/force-restart` | Force restart (kill + respawn)               | Admin       |
| `/cleanup`       | Clean old messages from status thread        | Admin       |

---

## Phase 2: Embeds and Interactive Components

Port the Python `BotStatusView` embed system to Rust with Serenity's `CreateEmbed` and component interactions.

### Status Embed

Replicate the notification-bot's status embed:

- State-based color and thumbnail (Online/Offline/Starting/Stopping/Error)
- Fields: shard info with latency, guild count, memory usage bar, CPU %, uptime
- Timestamp of last update
- Footer with bot version

### Interactive Buttons

Serenity supports message components (buttons, select menus). Implement:

- **Refresh** button — re-fetch health data and edit the embed in-place
- **Cleanup** button — trigger thread message cleanup
- **Restart** button — admin-only, requires permission check before executing

### Implementation Approach

- Create an `EmbedBuilder` helper in `src/discord/embeds/status.rs` that constructs `CreateEmbed` from health data
- Use Serenity's `ComponentInteraction` collector for button handling
- Store a `ComponentInteractionCollector` or use the poise framework's built-in component handling
- Persist button state with `custom_id` prefixes (e.g., `status_refresh`, `status_cleanup`, `status_restart`)

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

## Proposed Source Layout

```
apps/discordsh/axum-discordsh/src/
├── main.rs                     # Entry point, tokio runtime
├── discord/
│   ├── mod.rs                  # Module declarations
│   ├── bot.rs                  # Bot startup, token resolution, poise framework setup
│   ├── commands/
│   │   ├── mod.rs              # Command registration
│   │   ├── ping.rs             # /ping
│   │   ├── status.rs           # /status (embed + buttons)
│   │   ├── health.rs           # /health
│   │   └── admin.rs            # /restart, /force-restart, /cleanup
│   ├── embeds/
│   │   ├── mod.rs
│   │   └── status.rs           # Status embed builder
│   ├── components/
│   │   ├── mod.rs
│   │   └── status_buttons.rs   # Button interaction handlers
│   └── events.rs               # Shard/guild event handlers
├── health/
│   ├── mod.rs                  # HealthMonitor
│   └── metrics.rs              # Metric collection
├── tracker/
│   ├── mod.rs                  # Shard tracker (Supabase)
│   └── shard.rs                # Shard assignment logic
├── transport/
│   ├── mod.rs
│   └── https.rs                # Axum HTTP server + API routes
└── astro/
    ├── mod.rs
    └── askama.rs               # Static file serving (existing)
```

---

## Execution Order

| Step | Phase | What                                                   | Risk | Notes                       |
| ---- | ----- | ------------------------------------------------------ | ---- | --------------------------- |
| 1    | 1     | Add `poise` dependency, scaffold command module        | Low  | No breaking changes         |
| 2    | 1     | Migrate `!ping` to `/ping` slash command               | Low  | Replace text command        |
| 3    | 1     | Add `/status` and `/health` commands (text-only first) | Low  | New commands                |
| 4    | 3     | Add `sysinfo` dependency, implement HealthMonitor      | Low  | New module                  |
| 5    | 2     | Build status embed with health data                    | Med  | Embed formatting            |
| 6    | 2     | Add interactive buttons to status embed                | Med  | Component interactions      |
| 7    | 1     | Add admin commands (`/restart`, `/cleanup`)            | Med  | Permission checks           |
| 8    | 4     | Expand HTTP API endpoints                              | Low  | Axum routes                 |
| 9    | 5     | Expand Supabase tracker integration                    | Med  | Depends on kbve crate       |
| 10   | 6     | Add distributed sharding support                       | High | Multi-instance coordination |
| 11   | 7     | Expand event handlers                                  | Low  | Additional serenity events  |
| 12   | —     | Integration testing, Docker verification               | Med  | E2E with discordsh-e2e      |
| 13   | —     | Deprecate notification-bot, update CI                  | Low  | Remove Python project       |

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
