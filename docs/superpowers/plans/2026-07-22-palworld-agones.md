# Palworld Server + Agones SDK Integration — Implementation Plan

> **✅ SHIPPED (#14503).** This plan is implemented — Agones `GameServer` + relay
> sidecar are live. In-game chat was added later via Windows UE4SS under Wine
> (base image pivoted from `thijsvanloef` to `ripps818`); see
> [`docs/superpowers/specs/2026-07-23-palworld-wine-ue4ss-chat-design.md`](../specs/2026-07-23-palworld-wine-ue4ss-chat-design.md).
> Retained for historical/reference context.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Palworld dedicated server as an Agones `GameServer` in the kbve ecosystem, 1:1 with `apps/agones/factorio`: upstream game container + Rust relay sidecar driving Agones health/ready, gameops ClickHouse telemetry, and a one-way IRC bridge.

**Architecture:** Two-container Agones `GameServer`. Container 1 = upstream `thijsvanloef/palworld-server-docker` thin-wrapped with a preStop shim. Container 2 = new `agones-palworld-relay` Rust bin (copied/adapted from `agones-factorio-relay`) that polls the Palworld REST API, POSTs `/health`+`/ready` to the Agones HTTP SDK sidecar (`127.0.0.1:9358`), writes to ClickHouse `gameops`, and bridges events to IRC.

**Tech Stack:** Rust (tokio, reqwest+rustls, serde, jedi[clickhouse]), Docker, Nx (`@monodon/rust`, `@nx-tools/nx-container`), Agones, Kubernetes, SealedSecrets/ExternalSecrets, ArgoCD, vitest (e2e).

**Reference (read before each task):**
- `apps/agones/factorio/relay/src/*` — relay pattern to copy
- `apps/agones/factorio/Dockerfile`, `apps/agones/factorio/project.json`, `apps/agones/factorio/docker-compose.yml`
- `apps/agones/factorio/shim/agones-shim-prestop.sh`
- `apps/kube/agones/factorio/manifests/*` + `application.yaml`
- Spec: `docs/superpowers/specs/2026-07-22-palworld-agones-design.md`

## Global Constraints

- **Rust MSRV `1.96`** — workspace `rust-version = "1.96"` (matches factorio relay). Do not bump.
- **No comments in code** — user preference: drop all comments, inline and block, in every source file produced.
- **No manual version bumps beyond sentinels** — `version.toml` uses `0.0.1` on first publish (sentinel = publish). Do not hand-edit later.
- **Worktree tooling** — this branch was created with `GIT_LFS_SKIP_SMUDGE=1`; do NOT run `npm install`/`pnpm install`. Run Nx with `--skip-nx-cache` when needed. No `node_modules` in worktree.
- **Nx via `./kbve.sh -nx <target>`** — never raw cargo/docker for build targets.
- **runAsNonRoot / UID 1000** — all containers; drop ALL caps; seccomp RuntimeDefault.
- **Ports:** game 8211/udp (Static hostPort), query 27015/udp, RCON 25575/tcp (127.0.0.1), REST 8212/tcp (127.0.0.1 for relay), Agones SDK 9358/tcp.
- **RCON path is optional/fallback** — REST is primary. Tasks build REST first; RCON modules ported for parity but the `poller`/`agones_health` MUST NOT depend on RCON.
- **Relay package name:** `agones-palworld-relay`. **Image names:** `ghcr.io/kbve/agones-palworld`, `ghcr.io/kbve/agones-palworld-relay`.
- **Nx `scope:agones` tag** on both projects.

---

## File Structure

**Relay crate** (`apps/agones/palworld/relay/`):
- `src/main.rs` — orchestrator, `tokio::select!` over task handles
- `src/config.rs` — `Config` + `Config::from_env()`
- `src/event.rs` — `GameEvent`, `GameEventKind`, `IrcMessage`
- `src/rest_client.rs` — Palworld REST client + typed responses
- `src/poller.rs` — poll `/players`+`/metrics`, diff, emit `GameEvent`s
- `src/agones_health.rs` — REST `/info` probe → POST `/health`+`/ready`
- `src/irc_bridge.rs` — `GameEvent`→IRC, IRC→REST `/announce`
- `src/ch_writer.rs` — gameops ClickHouse writer
- `src/rcon_pool.rs`, `src/rcon_client.rs` — optional RCON (ported for parity)
- `Cargo.toml`, `Cargo.workspace.toml`, `Dockerfile`, `project.json`, `version.toml`

**Game image** (`apps/agones/palworld/`):
- `Dockerfile`, `docker-compose.yml`, `project.json`, `version.toml`
- `shim/agones-shim-prestop.sh`
- `e2e/palworld.e2e.test.ts`, `vitest.config.ts`, `tsconfig.e2e.json`

**Kube** (`apps/kube/agones/palworld/`):
- `namespace.yaml`, `manifests/gameserver.yaml`, `manifests/saves-pvc.yaml`, `manifests/rcon-sealed-secret.yaml`, `manifests/credentials-sealed-secret.yaml`, `manifests/clickhouse-externalsecret.yaml`, `application.yaml`

---

## Task 1: Relay crate scaffold + config

**Files:**
- Create: `apps/agones/palworld/relay/Cargo.toml`
- Create: `apps/agones/palworld/relay/Cargo.workspace.toml`
- Create: `apps/agones/palworld/relay/version.toml`
- Create: `apps/agones/palworld/relay/src/config.rs`
- Create: `apps/agones/palworld/relay/src/main.rs` (temporary minimal, replaced in Task 7)
- Test: `apps/agones/palworld/relay/src/config.rs` (inline `#[cfg(test)]`)

**Interfaces:**
- Produces: `Config` struct with fields below; `Config::from_env() -> anyhow::Result<Config>`.

`Config` fields (types):
```
rest_addr: String            // PALWORLD_REST_ADDR, default "http://127.0.0.1:8212"
admin_password: String       // PALWORLD_ADMIN_PASSWORD (required)
rcon_addr: std::net::SocketAddr  // PALWORLD_RCON_ADDR, default "127.0.0.1:25575"
rcon_password: Option<String>    // PALWORLD_RCON_PASSWORD
server_id: String            // PALWORLD_SERVER_ID, default "palworld-default"
irc_server: String; irc_port: u16; irc_use_tls: bool; irc_nick: String; irc_channel: String; irc_password: Option<String>
clickhouse_url: Option<String>; clickhouse_user: Option<String>; clickhouse_password: Option<String>; clickhouse_database: String
agones_sdk_http: Option<String>  // AGONES_SDK_HTTP
agones_health_interval_secs: u64 // default 5
agones_rest_probe_timeout_secs: u64 // default 2
agones_initial_ready_delay_secs: u64 // default 60
poll_interval_secs: u64          // PALWORLD_POLL_INTERVAL_SECS, default 10
```

- [ ] **Step 1: Copy `Cargo.toml` from factorio relay, rename package**

Read `apps/agones/factorio/relay/Cargo.toml`. Create `apps/agones/palworld/relay/Cargo.toml` identical EXCEPT `name = "agones-palworld-relay"`. Keep all deps (anyhow, thiserror, tokio full features, tracing, tracing-subscriber, serde, serde_json, futures, uuid, reqwest rustls+json, chrono, `jedi = { path = "../../../../packages/rust/jedi", features = ["clickhouse"] }`, tokio-rustls, webpki-roots, rustls).

- [ ] **Step 2: Copy `Cargo.workspace.toml`, repoint members**

Create `apps/agones/palworld/relay/Cargo.workspace.toml`:
```toml
[workspace]
resolver = "2"
members = [
    "apps/agones/palworld/relay",
    "packages/rust/jedi",
]

[workspace.package]
rust-version = "1.96"

[profile.release]
opt-level = 3
lto = true
strip = true
codegen-units = 1
panic = "abort"
```

- [ ] **Step 3: version.toml**

Create `apps/agones/palworld/relay/version.toml`:
```toml
version = "0.0.1"
```

- [ ] **Step 4: Write config.rs with a failing env-parse test**

Create `apps/agones/palworld/relay/src/config.rs`. Model on factorio `config.rs` (parse helpers `parse_env_u64/u16/bool`). Include the `Config` struct and `from_env` per the Interfaces block. Add an inline test:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_apply_when_unset() {
        // SAFETY: single-threaded test
        unsafe {
            std::env::set_var("PALWORLD_ADMIN_PASSWORD", "pw");
            std::env::remove_var("PALWORLD_REST_ADDR");
            std::env::remove_var("PALWORLD_POLL_INTERVAL_SECS");
        }
        let cfg = Config::from_env().unwrap();
        assert_eq!(cfg.rest_addr, "http://127.0.0.1:8212");
        assert_eq!(cfg.poll_interval_secs, 10);
        assert_eq!(cfg.agones_initial_ready_delay_secs, 60);
        assert_eq!(cfg.clickhouse_database, "gameops");
    }

    #[test]
    fn admin_password_required() {
        unsafe { std::env::remove_var("PALWORLD_ADMIN_PASSWORD"); }
        assert!(Config::from_env().is_err());
    }
}
```

`admin_password` uses `.context("PALWORLD_ADMIN_PASSWORD env var is required")?`. `rest_addr` default `"http://127.0.0.1:8212"`. `rcon_addr` parses `PALWORLD_RCON_ADDR` default `"127.0.0.1:25575"`. `clickhouse_database` default `"gameops"`. `irc_nick` default `"palworld-bot"`, `irc_channel` default `"#general"`, `irc_port` default `6697`, `irc_use_tls` default `true`, `irc_server` default `"irc.kbve.com"`.

- [ ] **Step 5: Minimal main.rs so the crate compiles**

Create `apps/agones/palworld/relay/src/main.rs`:
```rust
mod config;

use anyhow::Result;

fn main() -> Result<()> {
    let _cfg = config::Config::from_env()?;
    Ok(())
}
```

- [ ] **Step 6: Run the config tests**

Run: `cargo test --manifest-path apps/agones/palworld/relay/Cargo.toml`
Expected: 2 tests PASS. (The `admin_password_required` test must run in a process where the var is unset — the two tests touch the same var; if they interfere, gate with `#[serial]` is NOT available, so instead make `admin_password_required` set-then-remove is fine because both remove first. If flaky, run `-- --test-threads=1`.)

Note: run cargo directly here (unit-test iteration), not via Nx. `Cargo.toml` in the crate dir is a standalone package pointing at the workspace file only for Docker builds; ensure `cargo test --manifest-path .../relay/Cargo.toml` resolves `jedi` via the relative path.

- [ ] **Step 7: Commit**

```bash
git add apps/agones/palworld/relay
git commit -m "feat(agones-palworld): relay crate scaffold + config (#14503)"
```

---

## Task 2: event.rs (shared event types)

**Files:**
- Create: `apps/agones/palworld/relay/src/event.rs`
- Modify: `apps/agones/palworld/relay/src/main.rs` (add `mod event;`)

**Interfaces:**
- Produces: `GameEvent { kind: GameEventKind, player: Option<String>, text: String, raw: String, fields: HashMap<String,String> }`, `GameEvent::field(&self, &str) -> Option<&str>`; `GameEventKind { Chat, Join, Leave, Command, Stats }`; `IrcMessage { nick, channel, text }`.

- [ ] **Step 1: Copy event.rs verbatim from factorio**

Create `apps/agones/palworld/relay/src/event.rs` = exact copy of `apps/agones/factorio/relay/src/event.rs` (types are game-agnostic, reused as-is).

- [ ] **Step 2: Wire module**

Add `mod event;` to `main.rs`.

- [ ] **Step 3: Compile check**

Run: `cargo build --manifest-path apps/agones/palworld/relay/Cargo.toml`
Expected: builds (warnings for unused ok).

- [ ] **Step 4: Commit**

```bash
git add apps/agones/palworld/relay/src/event.rs apps/agones/palworld/relay/src/main.rs
git commit -m "feat(agones-palworld): shared GameEvent types (#14503)"
```

---

## Task 3: rest_client.rs (Palworld REST client)

**Files:**
- Create: `apps/agones/palworld/relay/src/rest_client.rs`
- Modify: `apps/agones/palworld/relay/src/main.rs` (add `mod rest_client;`)
- Test: inline `#[cfg(test)]` in `rest_client.rs`

**Interfaces:**
- Produces:
  - `struct RestClient { http: reqwest::Client, base: String, admin_password: String }`
  - `RestClient::new(base: String, admin_password: String, timeout: Duration) -> anyhow::Result<RestClient>`
  - `async fn info(&self) -> anyhow::Result<InfoResp>`
  - `async fn metrics(&self) -> anyhow::Result<MetricsResp>`
  - `async fn players(&self) -> anyhow::Result<PlayersResp>`
  - `async fn announce(&self, message: &str) -> anyhow::Result<()>`
  - `async fn shutdown(&self, waittime: u32, message: &str) -> anyhow::Result<()>`
  - Types: `InfoResp { version: String, servername: String }`, `MetricsResp { serverfps: i64, currentplayernum: i64, serveruptime: i64, serverframetime: f64 }`, `Player { name: String, playerId: String, userId: String, ping: f64, level: i64 }` (serde rename as needed), `PlayersResp { players: Vec<Player> }`.

Palworld REST auth = HTTP Basic `admin:<admin_password>`. Endpoints under `{base}/v1/api/...`.

- [ ] **Step 1: Write failing deserialize tests**

Add to `rest_client.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_metrics() {
        let j = r#"{"serverfps":58,"currentplayernum":3,"serveruptime":1200,"serverframetime":16.9,"maxplayernum":32}"#;
        let m: MetricsResp = serde_json::from_str(j).unwrap();
        assert_eq!(m.currentplayernum, 3);
        assert_eq!(m.serverfps, 58);
    }

    #[test]
    fn parse_players() {
        let j = r#"{"players":[{"name":"Al","playerId":"abc","userId":"steam_1","ip":"","ping":42.0,"location_x":0.0,"location_y":0.0,"level":5,"building_count":0}]}"#;
        let p: PlayersResp = serde_json::from_str(j).unwrap();
        assert_eq!(p.players.len(), 1);
        assert_eq!(p.players[0].name, "Al");
        assert_eq!(p.players[0].level, 5);
    }

    #[test]
    fn parse_info() {
        let j = r#"{"version":"v0.3.11","servername":"KBVE Pal"}"#;
        let i: InfoResp = serde_json::from_str(j).unwrap();
        assert_eq!(i.servername, "KBVE Pal");
    }
}
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cargo test --manifest-path apps/agones/palworld/relay/Cargo.toml rest_client`
Expected: FAIL — types not defined.

- [ ] **Step 3: Implement rest_client.rs**

```rust
use std::time::Duration;

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Clone, Deserialize)]
pub struct InfoResp {
    pub version: String,
    pub servername: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetricsResp {
    pub serverfps: i64,
    pub currentplayernum: i64,
    pub serveruptime: i64,
    pub serverframetime: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Player {
    #[serde(default)]
    pub name: String,
    #[serde(rename = "playerId", default)]
    pub player_id: String,
    #[serde(rename = "userId", default)]
    pub user_id: String,
    #[serde(default)]
    pub ping: f64,
    #[serde(default)]
    pub level: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayersResp {
    #[serde(default)]
    pub players: Vec<Player>,
}

pub struct RestClient {
    http: reqwest::Client,
    base: String,
    admin_password: String,
}

impl RestClient {
    pub fn new(base: String, admin_password: String, timeout: Duration) -> Result<Self> {
        let http = reqwest::Client::builder().timeout(timeout).build()?;
        Ok(Self {
            http,
            base: base.trim_end_matches('/').to_string(),
            admin_password,
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}/v1/api/{}", self.base, path)
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let resp = self
            .http
            .get(self.url(path))
            .basic_auth("admin", Some(&self.admin_password))
            .send()
            .await
            .with_context(|| format!("GET {path} failed"))?
            .error_for_status()?;
        Ok(resp.json::<T>().await?)
    }

    pub async fn info(&self) -> Result<InfoResp> {
        self.get_json("info").await
    }

    pub async fn metrics(&self) -> Result<MetricsResp> {
        self.get_json("metrics").await
    }

    pub async fn players(&self) -> Result<PlayersResp> {
        self.get_json("players").await
    }

    pub async fn announce(&self, message: &str) -> Result<()> {
        self.http
            .post(self.url("announce"))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&json!({ "message": message }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    pub async fn shutdown(&self, waittime: u32, message: &str) -> Result<()> {
        self.http
            .post(self.url("shutdown"))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&json!({ "waittime": waittime, "message": message }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}
```

Add `mod rest_client;` to `main.rs`.

- [ ] **Step 4: Run tests, verify pass**

Run: `cargo test --manifest-path apps/agones/palworld/relay/Cargo.toml rest_client`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/palworld/relay/src/rest_client.rs apps/agones/palworld/relay/src/main.rs
git commit -m "feat(agones-palworld): Palworld REST client (#14503)"
```

---

## Task 4: poller.rs (REST poll → player diff → GameEvents)

**Files:**
- Create: `apps/agones/palworld/relay/src/poller.rs`
- Modify: `apps/agones/palworld/relay/src/main.rs` (add `mod poller;`)
- Test: inline `#[cfg(test)]` in `poller.rs` (pure diff fn)

**Interfaces:**
- Consumes: `RestClient` (Task 3), `GameEvent`/`GameEventKind` (Task 2), `Config` (Task 1).
- Produces:
  - `fn diff_players(prev: &std::collections::HashSet<String>, curr: &std::collections::HashSet<String>) -> (Vec<String> /*joined*/, Vec<String> /*left*/)`
  - `async fn run(cfg: Config, tx: tokio::sync::broadcast::Sender<GameEvent>) -> anyhow::Result<()>`

- [ ] **Step 1: Write failing diff test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn diff_detects_join_and_leave() {
        let prev: HashSet<String> = ["a", "b"].iter().map(|s| s.to_string()).collect();
        let curr: HashSet<String> = ["b", "c"].iter().map(|s| s.to_string()).collect();
        let (joined, left) = diff_players(&prev, &curr);
        assert_eq!(joined, vec!["c".to_string()]);
        assert_eq!(left, vec!["a".to_string()]);
    }
}
```

- [ ] **Step 2: Run, verify fail**

Run: `cargo test --manifest-path apps/agones/palworld/relay/Cargo.toml poller`
Expected: FAIL — `diff_players` undefined.

- [ ] **Step 3: Implement poller.rs**

```rust
use std::collections::{HashMap, HashSet};
use std::time::Duration;

use anyhow::Result;
use tokio::sync::broadcast::Sender;
use tokio::time;
use tracing::{debug, warn};

use crate::config::Config;
use crate::event::{GameEvent, GameEventKind};
use crate::rest_client::RestClient;

pub fn diff_players(prev: &HashSet<String>, curr: &HashSet<String>) -> (Vec<String>, Vec<String>) {
    let mut joined: Vec<String> = curr.difference(prev).cloned().collect();
    let mut left: Vec<String> = prev.difference(curr).cloned().collect();
    joined.sort();
    left.sort();
    (joined, left)
}

fn stats_event(kind: &str, fields: HashMap<String, String>) -> GameEvent {
    GameEvent {
        kind: GameEventKind::Stats,
        player: None,
        text: String::new(),
        raw: String::new(),
        fields: {
            let mut f = fields;
            f.insert("kind".into(), kind.into());
            f
        },
    }
}

pub async fn run(cfg: Config, tx: Sender<GameEvent>) -> Result<()> {
    let client = RestClient::new(
        cfg.rest_addr.clone(),
        cfg.admin_password.clone(),
        Duration::from_secs(cfg.agones_rest_probe_timeout_secs.max(5)),
    )?;

    let mut prev: HashSet<String> = HashSet::new();
    let mut ticker = time::interval(Duration::from_secs(cfg.poll_interval_secs));
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        let players = match client.players().await {
            Ok(p) => p,
            Err(e) => {
                debug!(error = %e, "poller: players fetch failed");
                continue;
            }
        };
        let curr: HashSet<String> = players
            .players
            .iter()
            .map(|p| if p.player_id.is_empty() { p.name.clone() } else { p.player_id.clone() })
            .collect();
        let name_by_id: HashMap<String, String> = players
            .players
            .iter()
            .map(|p| {
                let id = if p.player_id.is_empty() { p.name.clone() } else { p.player_id.clone() };
                (id, p.name.clone())
            })
            .collect();

        let (joined, left) = diff_players(&prev, &curr);
        for id in joined {
            let name = name_by_id.get(&id).cloned().unwrap_or_else(|| id.clone());
            let _ = tx.send(GameEvent {
                kind: GameEventKind::Join,
                player: Some(name),
                text: String::new(),
                raw: String::new(),
                fields: HashMap::new(),
            });
        }
        for id in left {
            let _ = tx.send(GameEvent {
                kind: GameEventKind::Leave,
                player: Some(id),
                text: String::new(),
                raw: String::new(),
                fields: HashMap::new(),
            });
        }
        prev = curr;

        match client.metrics().await {
            Ok(m) => {
                let mut f = HashMap::new();
                f.insert("players".into(), m.currentplayernum.to_string());
                f.insert("serverfps".into(), m.serverfps.to_string());
                f.insert("uptime".into(), m.serveruptime.to_string());
                f.insert("frametime".into(), format!("{:.3}", m.serverframetime));
                let _ = tx.send(stats_event("snapshot", f));
            }
            Err(e) => warn!(error = %e, "poller: metrics fetch failed"),
        }
    }
}
```

Add `mod poller;` to `main.rs`.

- [ ] **Step 4: Run, verify pass**

Run: `cargo test --manifest-path apps/agones/palworld/relay/Cargo.toml poller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/palworld/relay/src/poller.rs apps/agones/palworld/relay/src/main.rs
git commit -m "feat(agones-palworld): REST poller with player diff (#14503)"
```

---

## Task 5: agones_health.rs (REST probe → Agones health/ready)

**Files:**
- Create: `apps/agones/palworld/relay/src/agones_health.rs`
- Modify: `apps/agones/palworld/relay/src/main.rs` (add `mod agones_health;`)

**Interfaces:**
- Consumes: `Config` (Task 1), `RestClient` (Task 3).
- Produces: `async fn run(cfg: Config) -> anyhow::Result<()>`.

Behavior: mirror `apps/agones/factorio/relay/src/agones_health.rs` but the probe is `RestClient::info()` instead of a TCP connect. Disabled (returns Ok) if `agones_sdk_http` is `None`. Each tick: probe `info()`; on Ok POST `{}` to `{sdk}/health`; after `agones_initial_ready_delay_secs` elapsed, POST `/ready` once. Skip heartbeat if probe errors.

- [ ] **Step 1: Implement agones_health.rs**

```rust
use std::time::Duration;

use anyhow::Result;
use tokio::time;
use tracing::{debug, warn};

use crate::config::Config;
use crate::rest_client::RestClient;

pub async fn run(cfg: Config) -> Result<()> {
    let Some(sdk_base) = cfg.agones_sdk_http.clone() else {
        warn!("agones_health disabled: AGONES_SDK_HTTP not set");
        return Ok(());
    };

    let health_url = format!("{}/health", sdk_base.trim_end_matches('/'));
    let ready_url = format!("{}/ready", sdk_base.trim_end_matches('/'));
    let interval = Duration::from_secs(cfg.agones_health_interval_secs);
    let initial_delay = Duration::from_secs(cfg.agones_initial_ready_delay_secs);

    let probe = RestClient::new(
        cfg.rest_addr.clone(),
        cfg.admin_password.clone(),
        Duration::from_secs(cfg.agones_rest_probe_timeout_secs),
    )?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;

    let mut sent_ready = false;
    let started = time::Instant::now();
    let mut ticker = time::interval(interval);
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        if probe.info().await.is_err() {
            debug!("rest probe failed; skipping Agones heartbeat");
            continue;
        }

        if let Err(e) = client.post(&health_url).body("{}").send().await {
            warn!(url = %health_url, error = %e, "Agones /health POST failed");
            continue;
        }
        debug!(url = %health_url, "Agones /health heartbeat sent");

        if !sent_ready && started.elapsed() >= initial_delay {
            match client.post(&ready_url).body("{}").send().await {
                Ok(_) => {
                    sent_ready = true;
                    debug!(url = %ready_url, "Agones /ready posted from relay");
                }
                Err(e) => warn!(url = %ready_url, error = %e, "Agones /ready POST failed; will retry"),
            }
        }
    }
}
```

Add `mod agones_health;` to `main.rs`.

- [ ] **Step 2: Compile check**

Run: `cargo build --manifest-path apps/agones/palworld/relay/Cargo.toml`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add apps/agones/palworld/relay/src/agones_health.rs apps/agones/palworld/relay/src/main.rs
git commit -m "feat(agones-palworld): REST-probed Agones health/ready (#14503)"
```

---

## Task 6: ch_writer.rs + irc_bridge.rs

**Files:**
- Create: `apps/agones/palworld/relay/src/ch_writer.rs`
- Create: `apps/agones/palworld/relay/src/irc_bridge.rs`
- Modify: `apps/agones/palworld/relay/src/main.rs` (add both mods)

**Interfaces:**
- Consumes: `Config`, `GameEvent`/`GameEventKind`, `IrcMessage`, `RestClient`.
- Produces:
  - `ch_writer::run(cfg: Config, rx: broadcast::Receiver<GameEvent>) -> Result<()>`
  - `irc_bridge::run(cfg: Config, game_rx: broadcast::Receiver<GameEvent>, rest: std::sync::Arc<RestClient>) -> Result<()>`

- [ ] **Step 1: Implement ch_writer.rs (palworld tables)**

Adapt factorio `ch_writer.rs`. Tables:
```rust
const SNAPSHOTS_TABLE: &str = "gameops.palworld_snapshots_raw";
const PLAYER_EVENTS_TABLE: &str = "gameops.palworld_player_events_raw";
```
`Producer` keeps `ch: ClickHouseConfig`, `cfg: Config`, `rotation_id: String`, `started: Instant`. Implement `snapshot` from `Stats`/`kind=snapshot` fields (players, serverfps→`fps`, uptime, frametime), and `player_event` for `Join`/`Leave`. Row for snapshot:
```rust
let row = json!({
    "ts": Self::now_ts(),
    "server_id": self.cfg.server_id,
    "rotation_id": self.rotation_id,
    "players": ev.field("players").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
    "fps": ev.field("serverfps").and_then(|v| v.parse::<i64>().ok()).unwrap_or(0),
    "uptime_s": ev.field("uptime").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
    "frametime_ms": ev.field("frametime").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0),
    "map_age_wall_s": self.started.elapsed().as_secs(),
});
```
player_event row:
```rust
let row = json!({
    "ts": Self::now_ts(),
    "server_id": self.cfg.server_id,
    "rotation_id": self.rotation_id,
    "player": ev.player.as_deref().unwrap_or("unknown"),
    "event": event,
});
```
Keep the `CLICKHOUSE_URL` unset → drain-loop disable path from factorio verbatim. `handle` matches `Stats{kind=snapshot}→snapshot`, `Join→player_event("join")`, `Leave→player_event("leave")`, others ignored.

- [ ] **Step 2: Implement irc_bridge.rs (one-way + announce)**

Port factorio `irc_bridge.rs` connection/format logic (read it first). Outbound: subscribe to `GameEvent`s; format `Join`→`"<player> joined"`, `Leave`→`"<player> left"`, `Stats{snapshot}`→optional player-count line (skip if unchanged), send to IRC channel. Inbound IRC PRIVMSG in `cfg.irc_channel` → `rest.announce(&format!("[IRC {nick}] {text}")).await`. No RCON. Signature: `run(cfg, game_rx, rest: Arc<RestClient>)`.

If factorio's `irc_bridge.rs` is tightly coupled to an `mpsc<IrcMessage>` back-channel to RCON, replace that back-channel with a direct `rest.announce(...)` call inside the inbound handler.

- [ ] **Step 3: Wire mods**

Add `mod ch_writer;` and `mod irc_bridge;` to `main.rs`.

- [ ] **Step 4: Compile check**

Run: `cargo build --manifest-path apps/agones/palworld/relay/Cargo.toml`
Expected: builds.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/palworld/relay/src/ch_writer.rs apps/agones/palworld/relay/src/irc_bridge.rs apps/agones/palworld/relay/src/main.rs
git commit -m "feat(agones-palworld): gameops ClickHouse writer + one-way IRC bridge (#14503)"
```

---

## Task 7: main.rs orchestrator (+ optional RCON parity modules)

**Files:**
- Modify: `apps/agones/palworld/relay/src/main.rs` (full orchestrator)
- Create: `apps/agones/palworld/relay/src/rcon_pool.rs` (copy from factorio, swap env names via Config)
- Create: `apps/agones/palworld/relay/src/rcon_client.rs` (optional; announce-only stub OK — see note)

**Interfaces:**
- Consumes: all prior modules.
- Produces: running binary spawning `poller`, `ch_writer`, `irc_bridge`, `agones_health`.

- [ ] **Step 1: Copy rcon_pool.rs from factorio**

Copy `apps/agones/factorio/relay/src/rcon_pool.rs` verbatim; it reads `cfg.rcon_addr` / `cfg.rcon_password`. Since palworld `rcon_password` is `Option<String>`, in `rcon_pool::run` guard: if `cfg.rcon_password.is_none()`, log and return `Ok(())` without connecting. Adjust the `RconEndpoint::new(... cfg.rcon_password.clone().unwrap_or_default())` call and early-return.

- [ ] **Step 2: rcon_client.rs (thin, optional)**

Because IRC→game now goes through REST `/announce`, RCON is not needed for the bridge. Create a minimal `rcon_client.rs` that is NOT spawned by default (kept for parity/future). Simplest: omit spawning it in `main.rs`. If including, gate spawn behind `cfg.rcon_password.is_some()`.

- [ ] **Step 3: Write orchestrator main.rs**

```rust
mod agones_health;
mod ch_writer;
mod config;
mod event;
mod irc_bridge;
mod poller;
mod rcon_pool;
mod rest_client;

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use tokio::sync::broadcast;
use tracing::info;

use crate::config::Config;
use crate::event::GameEvent;
use crate::rest_client::RestClient;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("info,agones_palworld_relay=debug")
            }),
        )
        .init();

    let cfg = Config::from_env()?;
    info!(
        rest = %cfg.rest_addr,
        irc_server = %cfg.irc_server,
        irc_channel = %cfg.irc_channel,
        server_id = %cfg.server_id,
        clickhouse = %cfg.clickhouse_url.as_deref().unwrap_or("<unset>"),
        "agones-palworld-relay starting"
    );

    let (game_tx, _) = broadcast::channel::<GameEvent>(512);
    let rest = Arc::new(RestClient::new(
        cfg.rest_addr.clone(),
        cfg.admin_password.clone(),
        Duration::from_secs(5),
    )?);

    let poller_handle = tokio::spawn(poller::run(cfg.clone(), game_tx.clone()));
    let irc_handle = tokio::spawn(irc_bridge::run(cfg.clone(), game_tx.subscribe(), rest.clone()));
    let ch_handle = tokio::spawn(ch_writer::run(cfg.clone(), game_tx.subscribe()));
    let agones_handle = tokio::spawn(agones_health::run(cfg.clone()));

    drop(game_tx);

    tokio::select! {
        r = poller_handle => r??,
        r = irc_handle => r??,
        r = ch_handle => r??,
        r = agones_handle => r??,
        _ = tokio::signal::ctrl_c() => { info!("ctrl_c received, shutting down"); }
    }
    Ok(())
}
```

- [ ] **Step 4: Full build + test + clippy**

Run: `cargo test --manifest-path apps/agones/palworld/relay/Cargo.toml`
Expected: all unit tests PASS.
Run: `cargo clippy --manifest-path apps/agones/palworld/relay/Cargo.toml -- -D warnings`
Expected: no errors. Fix `dead_code` on unused rcon modules with `#[allow(dead_code)]` at module top, matching factorio's `#[allow(dead_code)]` usage on `Config`.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/palworld/relay/src
git commit -m "feat(agones-palworld): relay orchestrator + optional RCON parity (#14503)"
```

---

## Task 8: Relay Dockerfile + Nx project.json

**Files:**
- Create: `apps/agones/palworld/relay/Dockerfile`
- Create: `apps/agones/palworld/relay/project.json`

**Interfaces:**
- Produces: Nx project `agones-palworld-relay` with `build`/`test`/`lint`/`container`/`containerx` targets; image `kbve/agones-palworld-relay:latest`.

- [ ] **Step 1: Dockerfile**

Copy `apps/agones/factorio/relay/Dockerfile`, replace all `factorio` → `palworld` in paths/binary/env, set env block:
```
ENV RUST_LOG=info,agones_palworld_relay=debug \
    PALWORLD_REST_ADDR=http://127.0.0.1:8212 \
    PALWORLD_RCON_ADDR=127.0.0.1:25575 \
    IRC_SERVER=irc.kbve.com \
    IRC_PORT=6697 \
    IRC_USE_TLS=true \
    IRC_NICK=palworld-bot \
    IRC_CHANNEL=#general \
    CLICKHOUSE_DATABASE=gameops
```
COPY lines point at `apps/agones/palworld/relay/Cargo.workspace.toml`, `apps/agones/palworld/relay`, `packages/rust/jedi`. Build `-p agones-palworld-relay`, cache id `agones-palworld-relay-target`.

- [ ] **Step 2: project.json**

Copy `apps/agones/factorio/relay/project.json`, replace `factorio` → `palworld` in `name`, `sourceRoot`, all target-dirs (`dist/target/agones-palworld-relay`), image tags, version.toml paths, and the `./kbve.sh -nx agones-palworld-relay:containerx` commands. Keep `"tags": ["scope:agones"]`.

- [ ] **Step 3: Verify Nx sees the project**

Run: `./kbve.sh -nx agones-palworld-relay:lint --skip-nx-cache`
Expected: lint runs (clippy) and passes. (If Nx graph is stale, that's the known daemon flake — re-run with `--skip-nx-cache`.)

- [ ] **Step 4: Container build smoke**

Run: `./kbve.sh -nx agones-palworld-relay:containerx`
Expected: image `kbve/agones-palworld-relay:latest` builds.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/palworld/relay/Dockerfile apps/agones/palworld/relay/project.json
git commit -m "feat(agones-palworld): relay Dockerfile + nx project (#14503)"
```

---

## Task 9: Game image (Dockerfile + prestop shim) + docker-compose + project.json

**Files:**
- Create: `apps/agones/palworld/Dockerfile`
- Create: `apps/agones/palworld/shim/agones-shim-prestop.sh`
- Create: `apps/agones/palworld/docker-compose.yml`
- Create: `apps/agones/palworld/project.json`
- Create: `apps/agones/palworld/version.toml`

**Interfaces:**
- Produces: Nx project `agones-palworld`, image `kbve/agones-palworld:latest`, prestop at `/usr/local/bin/agones-shim-prestop`.

- [ ] **Step 1: Dockerfile (thin wrap of upstream)**

```dockerfile
ARG PALWORLD_IMAGE=thijsvanloef/palworld-server-docker
ARG PALWORLD_TAG=latest
FROM ${PALWORLD_IMAGE}:${PALWORLD_TAG}

USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl jq ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY apps/agones/palworld/shim/agones-shim-prestop.sh /usr/local/bin/agones-shim-prestop
RUN chmod +x /usr/local/bin/agones-shim-prestop
```
Keep upstream `ENTRYPOINT`/`USER` (do not override — upstream drops to PUID). Verify upstream default user; if it stays root and drops via gosu, leave as-is. Do NOT change upstream CMD/ENTRYPOINT.

- [ ] **Step 2: prestop shim (REST shutdown)**

```sh
#!/bin/sh
set -eu

REST_HOST="${PALWORLD_REST_BIND:-127.0.0.1}"
REST_PORT="${REST_API_PORT:-8212}"
ADMIN_PASS="${ADMIN_PASSWORD:-}"
WARN_SECS="${PRESTOP_WARN_SECS:-30}"

if [ -z "$ADMIN_PASS" ]; then
    echo "[prestop] ADMIN_PASSWORD unset — skipping graceful shutdown"
    exit 0
fi

base="http://${REST_HOST}:${REST_PORT}/v1/api"
auth="admin:${ADMIN_PASS}"

echo "[prestop] announcing restart"
curl -fsS -u "$auth" -X POST "$base/announce" \
    -H 'Content-Type: application/json' \
    -d "{\"message\":\"Server restarting in ${WARN_SECS}s — progress will be saved.\"}" >/dev/null 2>&1 || true

echo "[prestop] requesting graceful shutdown (save)"
curl -fsS -u "$auth" -X POST "$base/shutdown" \
    -H 'Content-Type: application/json' \
    -d "{\"waittime\":${WARN_SECS},\"message\":\"Restarting now. See you in a minute.\"}" >/dev/null 2>&1 || true

echo "[prestop] done"
exit 0
```

- [ ] **Step 3: docker-compose.yml (local dev)**

Model on factorio compose. Service `palworld`, build context `../../..`, dockerfile `apps/agones/palworld/Dockerfile`, platform linux/amd64, ports `8211:8211/udp`, `27015:27015/udp`, `25575:25575/tcp`, `8212:8212/tcp`. Env: `PUID=1000 PGID=1000 PORT=8211 PLAYERS=16 SERVER_NAME=KBVE-Palworld-Local ADMIN_PASSWORD=${ADMIN_PASSWORD:-localadmin} RCON_ENABLED=true RCON_PORT=25575 REST_API_ENABLED=true REST_API_PORT=8212 MULTITHREADING=true`. Volume `palworld-saves:/palworld/Pal/Saved`.

- [ ] **Step 4: version.toml + project.json**

`version.toml`: `version = "0.0.1"`.
project.json: copy `apps/agones/factorio/project.json`, replace `factorio`→`palworld`, `name` = `agones-palworld`, Dockerfile path, image tags `kbve/agones-palworld` / `ghcr.io/kbve/agones-palworld`. Update `e2e` target (Task 10 fills the vitest command); for now keep the `container` + `test` (noop) targets. Tag `scope:agones`.

- [ ] **Step 5: Container build smoke**

Run: `./kbve.sh -nx agones-palworld:container`
Expected: image `kbve/agones-palworld:latest` builds (pulls upstream base).

- [ ] **Step 6: Commit**

```bash
git add apps/agones/palworld/Dockerfile apps/agones/palworld/shim apps/agones/palworld/docker-compose.yml apps/agones/palworld/project.json apps/agones/palworld/version.toml
git commit -m "feat(agones-palworld): game image wrap + REST prestop shim + compose (#14503)"
```

---

## Task 10: e2e (vitest)

**Files:**
- Create: `apps/agones/palworld/e2e/palworld.e2e.test.ts`
- Create: `apps/agones/palworld/vitest.config.ts`
- Create: `apps/agones/palworld/tsconfig.e2e.json`
- Modify: `apps/agones/palworld/project.json` (`e2e` target)

**Interfaces:**
- Consumes: built `kbve/agones-palworld:latest`.
- Produces: `e2e` Nx target that boots the container and asserts REST `/v1/api/info` + `/metrics`.

- [ ] **Step 1: vitest.config.ts + tsconfig.e2e.json**

Copy from `apps/agones/factorio` (`vitest.config.ts`, `tsconfig.e2e.json`) verbatim.

- [ ] **Step 2: e2e test**

```ts
import { describe, it, expect } from 'vitest';

const HOST = process.env.PALWORLD_HOST ?? '127.0.0.1';
const REST = process.env.PALWORLD_REST ?? '8212';
const ADMIN = process.env.PALWORLD_ADMIN_PASSWORD ?? 'e2e-admin';
const base = `http://${HOST}:${REST}/v1/api`;
const auth = 'Basic ' + Buffer.from(`admin:${ADMIN}`).toString('base64');

describe('palworld REST', () => {
  it('serves /info', async () => {
    const res = await fetch(`${base}/info`, { headers: { Authorization: auth } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.version).toBe('string');
    expect(typeof body.servername).toBe('string');
  });

  it('serves /metrics', async () => {
    const res = await fetch(`${base}/metrics`, { headers: { Authorization: auth } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.currentplayernum).toBe('number');
  });
});
```

- [ ] **Step 3: e2e Nx target**

In `project.json`, add `e2e` (model on factorio's e2e). Command sequence:
1. `docker rm -f agones-palworld-e2e 2>/dev/null || true`
2. `docker run -d --name agones-palworld-e2e -p 8211:8211/udp -p 8212:8212/tcp -p 25575:25575/tcp -e PUID=1000 -e PGID=1000 -e PORT=8211 -e PLAYERS=4 -e SERVER_NAME=e2e -e ADMIN_PASSWORD=e2e-admin -e RCON_ENABLED=true -e REST_API_ENABLED=true -e REST_API_PORT=8212 -e MULTITHREADING=true kbve/agones-palworld:latest`
3. Wait loop (up to 600s — Palworld first boot downloads/initializes): `for i in $(seq 1 600); do if curl -fsS -u admin:e2e-admin http://127.0.0.1:8212/v1/api/info >/dev/null 2>&1; then echo ready after $i s; break; fi; if [ $i -eq 600 ]; then docker logs agones-palworld-e2e 2>&1 | tail -120; docker rm -f agones-palworld-e2e; exit 1; fi; sleep 1; done`
4. `PALWORLD_HOST=127.0.0.1 PALWORLD_REST=8212 PALWORLD_ADMIN_PASSWORD=e2e-admin npx vitest run; EC=$?; docker logs agones-palworld-e2e 2>&1 | tail -120; docker rm -f agones-palworld-e2e; exit $EC`

`dependsOn`: `container` (params forward). `cwd`: `apps/agones/palworld`. `cache: false`.

- [ ] **Step 4: Run e2e locally (best-effort)**

Run: `./kbve.sh -nx agones-palworld:e2e`
Expected: PASS. NOTE: Palworld boot is slow + needs SteamCMD download; if the environment can't run it, mark e2e as CI-gated and record that in the PR body rather than block. Confirm the `/v1/api/info` shape against real output and adjust `InfoResp` if fields differ (**resolves spec open-item #1**).

- [ ] **Step 5: Commit**

```bash
git add apps/agones/palworld/e2e apps/agones/palworld/vitest.config.ts apps/agones/palworld/tsconfig.e2e.json apps/agones/palworld/project.json
git commit -m "test(agones-palworld): e2e boots container + asserts REST (#14503)"
```

---

## Task 11: Kubernetes manifests + ArgoCD Application

**Files:**
- Create: `apps/kube/agones/palworld/namespace.yaml`
- Create: `apps/kube/agones/palworld/manifests/gameserver.yaml`
- Create: `apps/kube/agones/palworld/manifests/saves-pvc.yaml`
- Create: `apps/kube/agones/palworld/manifests/rcon-sealed-secret.yaml`
- Create: `apps/kube/agones/palworld/manifests/credentials-sealed-secret.yaml`
- Create: `apps/kube/agones/palworld/manifests/clickhouse-externalsecret.yaml`
- Create: `apps/kube/agones/palworld/application.yaml`

**Interfaces:**
- Consumes: images `ghcr.io/kbve/agones-palworld:<v>`, `ghcr.io/kbve/agones-palworld-relay:<v>`.
- Produces: an Agones `GameServer` + ArgoCD `Application` (tracks `main`, per repo convention).

- [ ] **Step 1: namespace + PVC**

`namespace.yaml`: namespace `palworld` (copy labels pattern from `apps/kube/agones/factorio/manifests/namespace.yaml`).
`saves-pvc.yaml`: PVC `palworld-saves`, copy storageClass/size pattern from factorio `saves-pvc.yaml` (bump size ~20Gi for Palworld saves; confirm against factorio's class).

- [ ] **Step 2: gameserver.yaml (two containers)**

Model on `apps/kube/agones/factorio/manifests/gameserver.yaml`. Key values:
- `spec.container: palworld`, port `game` Static hostPort **8211/UDP**, containerPort 8211.
- `health: { initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 5 }`, `terminationGracePeriodSeconds: 120`.
- podSecurityContext runAsNonRoot/1000/fsGroup 1000, seccomp RuntimeDefault.
- volumes: `palworld-saves` PVC → mount `/palworld/Pal/Saved`; emptyDir `tmp` if upstream needs writable paths.
- container `palworld` (image `ghcr.io/kbve/agones-palworld:<v>`): env `PUID/PGID=1000, SERVER_NAME, PORT=8211, PLAYERS, RCON_ENABLED=true, RCON_PORT=25575, REST_API_ENABLED=true, REST_API_PORT=8212, MULTITHREADING=true, BACKUP_ENABLED=true`, `ADMIN_PASSWORD` from `palworld-rcon` secret key `admin_password`, `SERVER_PASSWORD` from `palworld-credentials` key `server_password` (optional). Ports 8211/udp, 27015/udp, 25575/tcp, 8212/tcp. `preStop` exec `/usr/local/bin/agones-shim-prestop`. securityContext allowPrivilegeEscalation false, drop ALL.
  - NOTE: upstream image may require root to chown save dir + drop to PUID via gosu. If `runAsNonRoot: true` breaks upstream startup, set the pod-level `runAsNonRoot: false` with `runAsUser` unset for the game container ONLY, keep relay non-root. Decide during apply; document in PR. (**spec open-item #2**)
- container `palworld-relay` (image `ghcr.io/kbve/agones-palworld-relay:<v>`): env `PALWORLD_REST_ADDR=http://127.0.0.1:8212`, `PALWORLD_ADMIN_PASSWORD` from `palworld-rcon` key `admin_password`, `PALWORLD_RCON_ADDR=127.0.0.1:25575`, `PALWORLD_SERVER_ID=palworld-1`, IRC_* (server `ergo-irc-service.irc.svc.cluster.local`, port 6667, tls false, nick `palworld-bot`, channel `#general`), `AGONES_SDK_HTTP=http://127.0.0.1:9358`, `AGONES_HEALTH_INTERVAL_SECS=5`, `AGONES_REST_PROBE_TIMEOUT_SECS=2`, `AGONES_INITIAL_READY_DELAY_SECS=60`, CLICKHOUSE_* from `clickhouse-credentials` (optional), `CLICKHOUSE_DATABASE=gameops`, `RUST_LOG=info,agones_palworld_relay=debug`. resources 50m/64Mi → 500m/256Mi, readOnlyRootFilesystem true, drop ALL.

- [ ] **Step 3: secrets (placeholder sealed + externalsecret)**

`rcon-sealed-secret.yaml`: SealedSecret `palworld-rcon` with keys `admin_password`, `rcon_password` — copy the shape from factorio `rcon-sealed-secret.yaml`; leave `encryptedData` as a clearly-marked placeholder to be re-sealed against the cluster (do NOT invent ciphertext). Same for `credentials-sealed-secret.yaml` (`server_password`).
`clickhouse-externalsecret.yaml`: copy factorio `clickhouse-externalsecret.yaml`, retarget namespace `palworld`, secret name `clickhouse-credentials`.

- [ ] **Step 4: application.yaml (ArgoCD)**

Copy `apps/kube/agones/factorio/application.yaml`, retarget: name `palworld`, path `apps/kube/agones/palworld`, destination namespace `palworld`. Track `main` (repo convention: Apps track main, PRs→dev). Keep syncPolicy pattern.

- [ ] **Step 5: Validate YAML**

Run: `for f in $(find apps/kube/agones/palworld -name '*.yaml'); do python3 -c "import sys,yaml; list(yaml.safe_load_all(open('$f')))" && echo "ok $f"; done`
Expected: `ok` for every file.

- [ ] **Step 6: Commit**

```bash
git add apps/kube/agones/palworld
git commit -m "feat(agones-palworld): GameServer manifests + ArgoCD application (#14503)"
```

---

## Task 12: CI publish wiring + PR

**Files:**
- Modify: whatever CI manifest/registry file lists agones images (discover via grep for `agones-factorio` in `.github/` and manifest configs)

**Interfaces:**
- Produces: `agones-palworld` + `agones-palworld-relay` entries wherever `agones-factorio*` images are registered for build/publish.

- [ ] **Step 1: Find factorio's CI registration**

Run: `grep -rn "agones-factorio" .github apps/kube --include=*.yml --include=*.yaml --include=*.json | grep -v node_modules`
Expected: locate the workflow(s)/manifest(s) that build+publish agones-factorio and its relay.

- [ ] **Step 2: Mirror entries for palworld**

Add `agones-palworld` and `agones-palworld-relay` alongside every `agones-factorio` / `agones-factorio-relay` registration found (dispatch matrix, manifest, version tracking). Follow the exact pattern; do not restructure.

- [ ] **Step 3: Regenerate CI manifest if required**

If repo uses generated manifests (per memory `feedback_ci_manifest_regen`), run the documented regen (`ci-manifest` regen step) rather than hand-editing generated output. Verify build-then-sync ordering is preserved.

- [ ] **Step 4: Commit + push branch**

```bash
git add -A
git commit -m "ci(agones-palworld): register palworld + relay image builds (#14503)"
git push -u origin palworld-agones
```

- [ ] **Step 5: Open PR (targets dev)**

```bash
gh pr create --repo kbve/kbve --base dev --head palworld-agones \
  --title "feat(agones): Palworld dedicated server + Agones SDK integration (#14503)" \
  --body "Closes #14503. Palworld GameServer with agones-palworld-relay sidecar (REST-poll → Agones health/ready + gameops ClickHouse + one-way IRC). Kube docs: apps/kube/agones/palworld. Spec: docs/superpowers/specs/2026-07-22-palworld-agones-design.md."
```

---

## Self-Review

**Spec coverage:**
- Two-container GameServer → Task 9 (game), Task 7 (relay), Task 11 (manifest). ✓
- Relay modules (config/rest/poller/agones_health/irc/ch/rcon/event/main) → Tasks 1–7. ✓
- Divergences: poller-not-logtail (Task 4), REST-not-RCON probe (Task 5), one-way IRC (Task 6), REST prestop (Task 9). ✓
- Ports 8211/27015/25575/8212/9358 → Tasks 9, 11. ✓
- gameops CH tables → Task 6. ✓
- Testing: unit (Tasks 1,3,4), e2e (Task 10). ✓
- CI publish two images → Task 12. ✓
- Spec open-items: #1 REST shape verified in Task 10 Step 4; #2 save path + non-root in Task 11 Step 2; #3 RCON keep/drop decided in Task 7 (kept, gated). ✓

**Placeholder scan:** SealedSecret ciphertext is intentionally left as a marked placeholder (Task 11 Step 3) — real ciphertext requires the live cluster sealing key and must not be fabricated. All code steps contain full code.

**Type consistency:** `Config` fields (Task 1) referenced identically in Tasks 3–7. `GameEvent`/`GameEventKind` (Task 2) used consistently. `RestClient` method names (`info`/`metrics`/`players`/`announce`/`shutdown`) stable across Tasks 3–7, 9. `diff_players` signature stable Task 4.
