# Palworld UE4SS Chat Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relay in-game Palworld chat to kbve IRC on the native-Linux server via UE4SS, and stop relaying join/leave to IRC.

**Architecture:** A native-Linux UE4SS runtime is `LD_PRELOAD`-injected into the ELF Palworld server. A Lua mod hooks the chat UFunction and appends each message to a chat log on a shared `emptyDir`. The relay sidecar tails that file, emits `GameEvent{Chat}` onto the existing broadcast bus, and the IRC bridge forwards only chat. ClickHouse telemetry (join/leave/snapshots) is unchanged.

**Tech Stack:** Rust (tokio, anyhow) relay sidecar; RE-UE4SS-Linux prebuilt runtime; Lua mod; Docker (thijsvanloef base); Kubernetes/Agones manifest.

## Global Constraints

- Workspace MSRV: Rust 1.96.
- No code comments anywhere (project rule: drop all comments, including Lua and Dockerfile where practical; keep only shebangs and required directives).
- Version bumps are MDX-only. Do NOT hand-edit `version.toml`; the CI manifest derives it from the MDX `version` field.
- Do NOT add `Co-Authored-By` trailers to commits.
- UE4SS runtime pinned: `NullPrism/RE-UE4SS-Linux` release `linux-v0.1.0`, tarball sha256 `15f9f368f51619918f29f5adbae6a0411056896c65b76b30980be4899b0f48da`. Any bump is deliberate.
- Palworld base image pinned via the existing `PALWORLD_TAG` `ARG`.
- Relay crate: nx project `agones-palworld-relay`. This worktree has no `node_modules` — run the local test loop with `cargo test`/`cargo check` from `apps/agones/palworld/relay`. CI path is `pnpm nx test agones-palworld-relay`.
- Chat log line format (single source of truth): `<unix_ms>\t<player>\t<text>`, one message per line, UTF-8.

## File Structure

- `apps/agones/palworld/relay/src/config.rs` — add `chat_log_path` field + `CHAT_LOG_PATH` env.
- `apps/agones/palworld/relay/src/chat_tail.rs` — NEW: parse chat lines + follow the file, produce `GameEvent{Chat}`.
- `apps/agones/palworld/relay/src/main.rs` — declare + spawn `chat_tail`.
- `apps/agones/palworld/relay/src/irc_bridge.rs` — `format_for_irc`: relay Chat only.
- `apps/agones/palworld/mods/PalChatRelay/Scripts/main.lua` — NEW: chat hook → chat log.
- `apps/agones/palworld/mods/PalChatRelay/enabled.txt` — NEW: UE4SS mod enable marker.
- `apps/agones/palworld/Dockerfile` — fetch+verify UE4SS, stage bundle, launch wrapper.
- `apps/agones/palworld/entrypoint-ue4ss.sh` — NEW: launch shim that routes the server through `run_ue4ss.sh`.
- `apps/kube/agones/palworld/manifests/gameserver.yaml` — emptyDir volume, mounts, `CHAT_LOG_PATH`, securityContext.
- `apps/kbve/astro-kbve/src/content/docs/project/agones-palworld.mdx` — UE4SS layer + version bump.
- `apps/kbve/astro-kbve/src/content/docs/project/agones-palworld-relay.mdx` — chat relay + version bump.

Task order front-loads the relay (fully testable now without the game), then the container/Lua (needs a live server to confirm the hook), then docs. The P1 smoke-gate from the spec is Task 6 — it validates before any deploy.

---

### Task 1: Add CHAT_LOG_PATH to relay Config

**Files:**
- Modify: `apps/agones/palworld/relay/src/config.rs`

**Interfaces:**
- Produces: `Config.chat_log_path: Option<String>` read from env `CHAT_LOG_PATH`.

- [ ] **Step 1: Add the failing test**

Add to the `tests` module in `config.rs`:

```rust
    #[test]
    fn chat_log_path_defaults_none_and_reads_env() {
        unsafe {
            std::env::set_var("PALWORLD_ADMIN_PASSWORD", "pw");
            std::env::remove_var("CHAT_LOG_PATH");
        }
        assert_eq!(Config::from_env().unwrap().chat_log_path, None);
        unsafe {
            std::env::set_var("CHAT_LOG_PATH", "/shared/chat.log");
        }
        assert_eq!(
            Config::from_env().unwrap().chat_log_path,
            Some("/shared/chat.log".to_string())
        );
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p agones-palworld-relay config::tests::chat_log_path_defaults_none_and_reads_env`
Expected: FAIL to compile — `chat_log_path` is not a field of `Config`.

- [ ] **Step 3: Add the field and its env read**

Add to the `Config` struct (after `poll_interval_secs`):

```rust
    pub chat_log_path: Option<String>,
```

Add to the `Self { .. }` literal in `from_env` (after `poll_interval_secs: ...`):

```rust
            chat_log_path: std::env::var("CHAT_LOG_PATH").ok(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p agones-palworld-relay config::tests`
Expected: PASS (all config tests).

- [ ] **Step 5: Commit**

```bash
git add apps/agones/palworld/relay/src/config.rs
git commit -m "feat(agones-palworld-relay): add CHAT_LOG_PATH config"
```

---

### Task 2: chat_tail parser

**Files:**
- Create: `apps/agones/palworld/relay/src/chat_tail.rs`

**Interfaces:**
- Consumes: `crate::event::{GameEvent, GameEventKind}`.
- Produces: `pub fn parse_chat_line(line: &str) -> Option<GameEvent>` — parses `ts\tplayer\ttext` into `GameEvent{kind: Chat, player: Some(player), text}`; returns `None` for blank lines, missing tabs, or empty player/text.

- [ ] **Step 1: Write the parser module with a failing test**

Create `apps/agones/palworld/relay/src/chat_tail.rs`:

```rust
use std::collections::HashMap;

use crate::event::{GameEvent, GameEventKind};

pub fn parse_chat_line(line: &str) -> Option<GameEvent> {
    let line = line.trim_end_matches(['\r', '\n']);
    if line.is_empty() {
        return None;
    }
    let mut parts = line.splitn(3, '\t');
    let _ts = parts.next()?;
    let player = parts.next()?.trim();
    let text = parts.next()?.trim();
    if player.is_empty() || text.is_empty() {
        return None;
    }
    Some(GameEvent {
        kind: GameEventKind::Chat,
        player: Some(player.to_string()),
        text: text.to_string(),
        raw: line.to_string(),
        fields: HashMap::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_well_formed_line() {
        let ev = parse_chat_line("1784300000000\tAlice\thello world").unwrap();
        assert!(matches!(ev.kind, GameEventKind::Chat));
        assert_eq!(ev.player.as_deref(), Some("Alice"));
        assert_eq!(ev.text, "hello world");
    }

    #[test]
    fn keeps_tabs_in_message_body() {
        let ev = parse_chat_line("1\tBob\ta\tb").unwrap();
        assert_eq!(ev.text, "a\tb");
    }

    #[test]
    fn rejects_blank_and_malformed() {
        assert!(parse_chat_line("").is_none());
        assert!(parse_chat_line("   ").is_none());
        assert!(parse_chat_line("no-tabs-here").is_none());
        assert!(parse_chat_line("1\tOnlyPlayer").is_none());
        assert!(parse_chat_line("1\t\ttext").is_none());
        assert!(parse_chat_line("1\tPlayer\t").is_none());
    }
}
```

- [ ] **Step 2: Register the module**

Add to `apps/agones/palworld/relay/src/main.rs` after `mod ch_writer;`:

```rust
mod chat_tail;
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cargo test -p agones-palworld-relay chat_tail::tests`
Expected: PASS (3 tests). Note: `main.rs` will warn about unused `run` later; ignore until Task 3.

- [ ] **Step 4: Commit**

```bash
git add apps/agones/palworld/relay/src/chat_tail.rs apps/agones/palworld/relay/src/main.rs
git commit -m "feat(agones-palworld-relay): chat log line parser"
```

---

### Task 3: chat_tail file follower + main wiring

**Files:**
- Modify: `apps/agones/palworld/relay/src/chat_tail.rs`
- Modify: `apps/agones/palworld/relay/src/main.rs`

**Interfaces:**
- Consumes: `Config.chat_log_path` (Task 1), `parse_chat_line` (Task 2), `tokio::sync::broadcast::Sender<GameEvent>`.
- Produces: `pub async fn run(cfg: Config, tx: Sender<GameEvent>) -> anyhow::Result<()>` — follows the chat log, sends parsed `GameEvent{Chat}` on `tx`. Idles when `chat_log_path` is `None`.

- [ ] **Step 1: Add the follower `run` function**

Append to `apps/agones/palworld/relay/src/chat_tail.rs` (above the `#[cfg(test)]` module):

```rust
use std::time::Duration;

use anyhow::Result;
use tokio::io::{AsyncBufReadExt, AsyncSeekExt, BufReader};
use tokio::sync::broadcast::Sender;
use tokio::time;
use tracing::{debug, info, warn};

use crate::config::Config;

pub async fn run(cfg: Config, tx: Sender<GameEvent>) -> Result<()> {
    let Some(path) = cfg.chat_log_path.clone() else {
        warn!("chat_tail disabled: CHAT_LOG_PATH not set");
        return Ok(());
    };
    info!(path = %path, "chat_tail following chat log");

    let mut pos: u64 = 0;
    let mut ticker = time::interval(Duration::from_millis(500));
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        let file = match tokio::fs::File::open(&path).await {
            Ok(f) => f,
            Err(e) => {
                debug!(error = %e, "chat_tail: chat log not open yet");
                continue;
            }
        };
        let len = match file.metadata().await {
            Ok(m) => m.len(),
            Err(e) => {
                debug!(error = %e, "chat_tail: metadata failed");
                continue;
            }
        };
        if len < pos {
            pos = 0;
        }
        if len == pos {
            continue;
        }

        let mut reader = BufReader::new(file);
        if reader.seek(std::io::SeekFrom::Start(pos)).await.is_err() {
            continue;
        }
        let mut line = String::new();
        loop {
            line.clear();
            let n = match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(e) => {
                    debug!(error = %e, "chat_tail: read_line failed");
                    break;
                }
            };
            if !line.ends_with('\n') {
                break;
            }
            pos += n as u64;
            if let Some(ev) = parse_chat_line(&line) {
                let _ = tx.send(ev);
            }
        }
    }
}
```

- [ ] **Step 2: Spawn it from main**

In `apps/agones/palworld/relay/src/main.rs`, after the `poller_handle` spawn:

```rust
    let chat_handle = tokio::spawn(chat_tail::run(cfg.clone(), game_tx.clone()));
```

Add a branch to the `tokio::select!` (alongside the other `r = ..._handle`):

```rust
        r = chat_handle => r??,
```

- [ ] **Step 3: Verify it builds**

Run: `cargo build -p agones-palworld-relay`
Expected: builds, 0 errors.

- [ ] **Step 4: Integration test the follower**

Add to the `tests` module in `chat_tail.rs`:

```rust
    #[tokio::test]
    async fn follows_appended_lines() {
        use tokio::io::AsyncWriteExt;
        let dir = std::env::temp_dir().join(format!("chat_tail_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("chat.log");
        let path_str = path.to_string_lossy().to_string();

        let mut cfg = base_test_config();
        cfg.chat_log_path = Some(path_str.clone());

        let (tx, mut rx) = tokio::sync::broadcast::channel::<GameEvent>(16);
        let handle = tokio::spawn(run(cfg, tx));

        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        let mut f = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
            .unwrap();
        f.write_all(b"1\tCarol\tgg\n").await.unwrap();
        f.flush().await.unwrap();

        let ev = tokio::time::timeout(std::time::Duration::from_secs(3), rx.recv())
            .await
            .expect("timed out waiting for chat event")
            .unwrap();
        assert_eq!(ev.player.as_deref(), Some("Carol"));
        assert_eq!(ev.text, "gg");
        handle.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn base_test_config() -> Config {
        unsafe {
            std::env::set_var("PALWORLD_ADMIN_PASSWORD", "pw");
        }
        Config::from_env().unwrap()
    }
```

Add the needed import at the top of the `tests` module (below `use super::*;`):

```rust
    use crate::config::Config;
```

- [ ] **Step 5: Run the integration test**

Run: `cargo test -p agones-palworld-relay chat_tail::tests::follows_appended_lines -- --nocapture`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/agones/palworld/relay/src/chat_tail.rs apps/agones/palworld/relay/src/main.rs
git commit -m "feat(agones-palworld-relay): follow chat log and emit Chat events"
```

---

### Task 4: IRC formatter relays chat only

**Files:**
- Modify: `apps/agones/palworld/relay/src/irc_bridge.rs`

**Interfaces:**
- Consumes: `GameEvent`.
- Produces: `format_for_irc` returns `Some("<player> text")` for `Chat`; `None` for `Join`, `Leave`, `Stats`, `Command`.

- [ ] **Step 1: Replace the `format_for_irc` body**

In `apps/agones/palworld/relay/src/irc_bridge.rs`, replace the whole `format_for_irc` function with:

```rust
fn format_for_irc(ev: &GameEvent, last_players: &mut Option<u64>) -> Option<String> {
    let _ = last_players;
    match ev.kind {
        GameEventKind::Chat => {
            let text = ev.text.trim();
            if text.is_empty() {
                return None;
            }
            match ev.player.as_deref() {
                Some(player) => Some(format!("<{player}> {text}")),
                None => Some(text.to_string()),
            }
        }
        GameEventKind::Join
        | GameEventKind::Leave
        | GameEventKind::Stats
        | GameEventKind::Command => None,
    }
}
```

- [ ] **Step 2: Add tests**

Add a test module at the end of `irc_bridge.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn ev(kind: GameEventKind, player: Option<&str>, text: &str) -> GameEvent {
        GameEvent {
            kind,
            player: player.map(String::from),
            text: text.to_string(),
            raw: String::new(),
            fields: HashMap::new(),
        }
    }

    #[test]
    fn chat_is_relayed() {
        let mut lp = None;
        let out = format_for_irc(&ev(GameEventKind::Chat, Some("Alice"), "hi"), &mut lp);
        assert_eq!(out, Some("<Alice> hi".to_string()));
    }

    #[test]
    fn join_leave_stats_are_dropped() {
        let mut lp = None;
        assert_eq!(format_for_irc(&ev(GameEventKind::Join, Some("Al"), ""), &mut lp), None);
        assert_eq!(format_for_irc(&ev(GameEventKind::Leave, Some("Al"), ""), &mut lp), None);
        let mut stats = ev(GameEventKind::Stats, None, "");
        stats.fields.insert("kind".into(), "snapshot".into());
        stats.fields.insert("players".into(), "3".into());
        assert_eq!(format_for_irc(&stats, &mut lp), None);
    }

    #[test]
    fn empty_chat_is_dropped() {
        let mut lp = None;
        assert_eq!(format_for_irc(&ev(GameEventKind::Chat, Some("Al"), "   "), &mut lp), None);
    }
}
```

- [ ] **Step 3: Run the tests**

Run: `cargo test -p agones-palworld-relay irc_bridge::tests`
Expected: PASS (3 tests).

- [ ] **Step 4: Full crate check**

Run: `cargo test -p agones-palworld-relay`
Expected: PASS, no warnings that fail the build.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/palworld/relay/src/irc_bridge.rs
git commit -m "feat(agones-palworld-relay): relay in-game chat only, drop join/leave from IRC"
```

---

### Task 5: PalChatRelay Lua mod

**Files:**
- Create: `apps/agones/palworld/mods/PalChatRelay/Scripts/main.lua`
- Create: `apps/agones/palworld/mods/PalChatRelay/enabled.txt`

**Interfaces:**
- Produces: a UE4SS Lua mod that appends `os.time-ms \t player \t text` lines to the path in env `PALWORLD_CHAT_LOG` (default `/palworld/chat-relay/chat.log`), matching the Task 2 parser format.

**Note on the hook target:** the exact chat UFunction is confirmed at runtime in Task 6 (`UE4SS_DIAGNOSE`/ConsoleCommands object dump, or lifted from an existing Nexus chat mod). The name below is the working default to validate first; if the dump shows a different signature, update the `RegisterHook` string and the argument extraction, keeping the output format identical.

- [ ] **Step 1: Write the mod script**

Create `apps/agones/palworld/mods/PalChatRelay/Scripts/main.lua`:

```lua
local CHAT_LOG = os.getenv("PALWORLD_CHAT_LOG") or "/palworld/chat-relay/chat.log"
local CHAT_FUNC = "/Script/Pal.PalNetworkChatManager:BroadcastChat"

local function now_ms()
    return string.format("%d", os.time() * 1000)
end

local function sanitize(s)
    s = s:gsub("[\t\r\n]", " ")
    return s
end

local function append(player, text)
    local f = io.open(CHAT_LOG, "a")
    if not f then
        return
    end
    f:write(now_ms() .. "\t" .. sanitize(player) .. "\t" .. sanitize(text) .. "\n")
    f:close()
end

RegisterHook(CHAT_FUNC, function(self, chat_param)
    local ok, player, text = pcall(function()
        local p = chat_param:get()
        return tostring(p.SenderPlayerName:ToString()), tostring(p.Message:ToString())
    end)
    if ok and player and text and #text > 0 then
        append(player, text)
    end
end)
```

- [ ] **Step 2: Add the enable marker**

Create `apps/agones/palworld/mods/PalChatRelay/enabled.txt` with a single line:

```
1
```

- [ ] **Step 3: Sanity-check the file format**

Run: `head -1 apps/agones/palworld/mods/PalChatRelay/Scripts/main.lua`
Expected: prints the `local CHAT_LOG` line (file exists, LF line endings).

- [ ] **Step 4: Commit**

```bash
git add apps/agones/palworld/mods/PalChatRelay
git commit -m "feat(agones-palworld): PalChatRelay UE4SS chat hook mod"
```

---

### Task 6: Game container UE4SS layer + launch wrapper (P1 smoke-gate)

**Files:**
- Create: `apps/agones/palworld/entrypoint-ue4ss.sh`
- Modify: `apps/agones/palworld/Dockerfile`

**Interfaces:**
- Consumes: PalChatRelay mod (Task 5), pinned UE4SS tarball (Global Constraints).
- Produces: a game image that loads UE4SS and runs PalChatRelay, writing to `/palworld/chat-relay/chat.log`.

- [ ] **Step 1: Write the launch shim**

Create `apps/agones/palworld/entrypoint-ue4ss.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

STAGE=/palworld/Pal/Binaries/Linux
SERVER="$STAGE/PalServer-Linux-Shipping"
export PALWORLD_CHAT_LOG="${PALWORLD_CHAT_LOG:-/palworld/chat-relay/chat.log}"
mkdir -p "$(dirname "$PALWORLD_CHAT_LOG")"

if [[ ! -x "$SERVER" ]]; then
    exec /palworld/PalServer.sh "$@"
fi

export UE4SS_CRASH_LOG_DIR="$STAGE/UE4SS-crashes"
exec "$STAGE/run_ue4ss.sh" \
    --host-executable "$SERVER" \
    /palworld/PalServer.sh "$@"
```

- [ ] **Step 2: Add the UE4SS build stage to the Dockerfile**

In `apps/agones/palworld/Dockerfile`, after the existing `RUN apt-get ... curl jq ...` layer, add:

```dockerfile
ARG UE4SS_URL=https://github.com/NullPrism/RE-UE4SS-Linux/releases/download/linux-v0.1.0/RE-UE4SS-Linux-0.1.0-x86_64.tar.gz
ARG UE4SS_SHA256=15f9f368f51619918f29f5adbae6a0411056896c65b76b30980be4899b0f48da

RUN set -eux; \
    mkdir -p /opt/ue4ss /palworld/Pal/Binaries/Linux/Mods; \
    curl -fsSL "$UE4SS_URL" -o /tmp/ue4ss.tar.gz; \
    echo "$UE4SS_SHA256  /tmp/ue4ss.tar.gz" | sha256sum -c -; \
    tar xzf /tmp/ue4ss.tar.gz -C /opt/ue4ss --strip-components=1; \
    rm /tmp/ue4ss.tar.gz; \
    install -m 0755 /opt/ue4ss/libUE4SS.so /palworld/Pal/Binaries/Linux/libUE4SS.so; \
    install -m 0755 /opt/ue4ss/run_ue4ss.sh /palworld/Pal/Binaries/Linux/run_ue4ss.sh; \
    install -m 0644 /opt/ue4ss/UE4SS-settings.ini /palworld/Pal/Binaries/Linux/UE4SS-settings.ini; \
    cp -a /opt/ue4ss/Mods/. /palworld/Pal/Binaries/Linux/Mods/; \
    install -d -m 0755 /palworld/Pal/Binaries/Linux/UE4SS-crashes

COPY apps/agones/palworld/mods/PalChatRelay /palworld/Pal/Binaries/Linux/Mods/PalChatRelay
COPY apps/agones/palworld/entrypoint-ue4ss.sh /usr/local/bin/entrypoint-ue4ss
RUN chmod +x /usr/local/bin/entrypoint-ue4ss
```

- [ ] **Step 3: Confirm the base image launch path**

Run: `docker run --rm --entrypoint sh thijsvanloef/palworld-server-docker:latest -c 'ls -1 /palworld/PalServer.sh /palworld/Pal/Binaries/Linux/PalServer-Linux-Shipping 2>&1 | head'`
Expected: both paths listed. If the paths differ, update `STAGE`/`SERVER`/`/palworld/PalServer.sh` in the shim and the Dockerfile `install` targets to match, then re-run.

- [ ] **Step 4: Build the image**

Run: `docker build -f apps/agones/palworld/Dockerfile -t agones-palworld:ue4ss-test .`
Expected: build succeeds; the sha256 check passes.

- [ ] **Step 5: Smoke-gate — load + hook fires**

Run the server locally long enough to init, generate a chat message, and inspect. Because chat requires a connected client, the minimum gate is that UE4SS loads and PalChatRelay registers:

```bash
docker run --rm -e PALWORLD_ADMIN_PASSWORD=test -e UE4SS_DIAGNOSE=1 \
  --entrypoint /usr/local/bin/entrypoint-ue4ss \
  agones-palworld:ue4ss-test 2>&1 | tee /tmp/ue4ss-boot.log | head -80
grep -Ei "UE4SS|PalChatRelay|hook" /tmp/ue4ss-boot.log || true
cat /palworld/Pal/Binaries/Linux/UE4SS.log 2>/dev/null | head -40 || true
```

Expected: `UE4SS.log` shows the loader initialized and `PalChatRelay` mod loaded, no crash in `UE4SS-crashes/`.

**GATE:** If UE4SS does not load (glibc/exec-heap/compat failure), STOP. Capture `UE4SS.log` + `UE4SS-crashes/` and reassess (exec-heap securityContext in Task 7, a different UE4SS build, or shelve). Do not proceed to Task 7 until the loader initializes. Confirming the exact `CHAT_FUNC` (Task 5) and a real chat line in `chat.log` is done against a live server with a connected client during this gate; update the `RegisterHook` target if the object dump differs.

- [ ] **Step 6: Commit**

```bash
git add apps/agones/palworld/Dockerfile apps/agones/palworld/entrypoint-ue4ss.sh
git commit -m "feat(agones-palworld): bake native-Linux UE4SS + PalChatRelay into game image"
```

---

### Task 7: Wire the shared volume + launch in gameserver.yaml

**Files:**
- Modify: `apps/kube/agones/palworld/manifests/gameserver.yaml`

**Interfaces:**
- Consumes: game image entrypoint (Task 6), relay `CHAT_LOG_PATH` (Task 1).
- Produces: an `emptyDir` shared between game + relay; relay reads `CHAT_LOG_PATH`.

- [ ] **Step 1: Add the shared volume**

In the pod `volumes:` list (where `palworld-saves` is defined), add:

```yaml
                  - name: chat-relay
                    emptyDir: {}
```

- [ ] **Step 2: Mount it in the game container**

In the game container `volumeMounts:` (next to the `palworld-saves` mount at `/palworld/Pal/Saved`), add:

```yaml
                      - name: chat-relay
                        mountPath: /palworld/chat-relay
```

- [ ] **Step 3: Route the game container through the UE4SS entrypoint**

In the game container spec, add (matching the image from Task 6):

```yaml
                  command: ["/usr/local/bin/entrypoint-ue4ss"]
```

If the base image requires its own args, append them after the command; confirm against the Task 6 Step 3 output.

- [ ] **Step 4: Mount + configure the relay sidecar**

In the relay container (`image: ghcr.io/kbve/agones-palworld-relay...`), add a mount:

```yaml
                      - name: chat-relay
                        mountPath: /palworld/chat-relay
```

Add to its `env:` list:

```yaml
                      - name: CHAT_LOG_PATH
                        value: /palworld/chat-relay/chat.log
```

- [ ] **Step 5: exec-heap securityContext (only if Task 6 required it)**

If the Task 6 gate showed UE4SS needs an executable heap, add to the game container `securityContext` the minimum that made it load (recorded in Task 6), e.g. a seccomp profile allowing `mprotect`/`PROT_EXEC`. Do not grant blanket privilege beyond the existing `allowPrivilegeEscalation: true` unless the gate proved it necessary.

- [ ] **Step 6: Validate the manifest**

Run: `kubectl --dry-run=client -f apps/kube/agones/palworld/manifests/gameserver.yaml apply -o name 2>&1 | head` (or `yq . apps/kube/agones/palworld/manifests/gameserver.yaml >/dev/null && echo ok`)
Expected: `ok` / no schema error. Do NOT apply to the cluster.

- [ ] **Step 7: Commit**

```bash
git add apps/kube/agones/palworld/manifests/gameserver.yaml
git commit -m "feat(agones-palworld): share chat log volume, route game through UE4SS entrypoint"
```

---

### Task 8: Docs + version bumps

**Files:**
- Modify: `apps/kbve/astro-kbve/src/content/docs/project/agones-palworld-relay.mdx`
- Modify: `apps/kbve/astro-kbve/src/content/docs/project/agones-palworld.mdx`

**Interfaces:** none (documentation + MDX-driven version bump).

- [ ] **Step 1: Bump the relay MDX version + document chat**

In `agones-palworld-relay.mdx` frontmatter, bump `version` to the next patch (e.g. `"0.1.0"` → confirm current value first with `grep '^version:' apps/kbve/astro-kbve/src/content/docs/project/agones-palworld-relay.mdx`, then increment the patch). Update the relay description and the faq/features copy that says it relays "player join/leave" to state it relays in-game chat (via UE4SS) and no longer forwards join/leave to IRC (they remain in ClickHouse).

- [ ] **Step 2: Bump the game MDX version + document the UE4SS layer**

In `agones-palworld.mdx` frontmatter, bump `version` (patch increment, same method). Update the copy that describes the container as "vanilla" to document the native-Linux UE4SS layer, the pinned RE-UE4SS-Linux runtime, and the PalChatRelay chat hook.

- [ ] **Step 3: Build the docs site to confirm frontmatter parses**

Run: `./kbve.sh -nx kbve.astro-kbve:sync` (regenerates content; if the worktree lacks node_modules, note that CI runs this — otherwise run the sync).
Expected: no schema error on the two MDX files.

- [ ] **Step 4: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/project/agones-palworld-relay.mdx apps/kbve/astro-kbve/src/content/docs/project/agones-palworld.mdx
git commit -m "docs(agones-palworld): document UE4SS chat relay, bump versions"
```

---

## Self-Review

**Spec coverage:**
- Vendored UE4SS runtime (sha256 pin) → Task 6. ✓
- PalChatRelay Lua mod → Task 5. ✓
- Dockerfile UE4SS layer + launch wrapper → Task 6. ✓
- relay `chat_tail.rs` → Tasks 2, 3. ✓
- relay config `CHAT_LOG_PATH` → Task 1. ✓
- irc_bridge formatter (chat only) → Task 4. ✓
- gameserver.yaml emptyDir + mounts + securityContext → Task 7. ✓
- docs + version bumps → Task 8. ✓
- P1 smoke-gate → Task 6 Step 5. ✓
- ClickHouse telemetry untouched → no task modifies `ch_writer.rs`/`poller.rs`. ✓
- Out of scope (chat→CH, two-way bridge, build-from-source) → not present. ✓

**Type consistency:** `parse_chat_line` (Tasks 2/3), `chat_tail::run(cfg, tx)` (Task 3 + main), `Config.chat_log_path` (Tasks 1/3), `format_for_irc` signature unchanged (Task 4). Chat line format `ts\tplayer\ttext` identical in Lua writer (Task 5) and Rust parser (Task 2). Consistent.

**Placeholder scan:** no TBD/TODO; each code step shows full code. The one runtime-confirmed value (`CHAT_FUNC` UFunction name) is explicitly flagged as gate-validated with a documented default and update path, not a placeholder.
