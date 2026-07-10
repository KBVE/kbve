# ARPG Telemetry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire arpg (web, Discord Activity, Rust game server) into metrics.kbve.com error/warning tracking.

**Architecture:** Three independent pieces: (1) metrics service CORS gains wildcard-origin support + arpg origins in the deploy env; (2) Discord Activity entry adds a metrics proxy mapping + `initObserv`; (3) new `jedi::observ` feature provides a `tracing_subscriber` Layer (WARN+ERROR, per-callsite throttle), panic hook, and batched POST to the in-cluster ingest, wired into arpg-server.

**Tech Stack:** Rust (axum/tower-http, tracing-subscriber, reqwest, tokio, dashmap), TypeScript (@kbve/observ, Vite/React), k8s manifests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-arpg-telemetry-design.md`
- NO code comments except constraints code can't show (user rule).
- Build via `./kbve.sh -nx <project>:<target>` where an nx target exists; `cargo check -p <crate>` acceptable for validation (run from worktree root).
- metrics crate/nx project is named `met`, NOT `metrics`.
- jedi is a published crate — new deps MUST be optional behind feature `observ`.
- Capture path must never panic; transport failures log at `debug` only.
- Do not push dev/main directly; PR from `worktree-arpg-metrics` → `dev`.

---

### Task 1: metrics CORS wildcard origins

**Files:**
- Modify: `apps/metrics/src/main.rs` (cors_layer, ~line 21)
- Test: same file, `#[cfg(test)]` module

**Interfaces:**
- Produces: `cors_layer(cfg)` behavior change only; new pure fn `origin_allowed(allowed: &[String], origin: &str) -> bool`.

- [ ] **Step 1: Write failing tests** in `apps/metrics/src/main.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::origin_allowed;

    #[test]
    fn exact_match() {
        let allowed = vec!["https://arpg.kbve.com".to_string()];
        assert!(origin_allowed(&allowed, "https://arpg.kbve.com"));
        assert!(!origin_allowed(&allowed, "https://evil.kbve.com"));
    }

    #[test]
    fn wildcard_subdomain() {
        let allowed = vec!["https://*.discordsays.com".to_string()];
        assert!(origin_allowed(&allowed, "https://12345.discordsays.com"));
        assert!(!origin_allowed(&allowed, "https://evildiscordsays.com"));
        assert!(!origin_allowed(&allowed, "http://12345.discordsays.com"));
        assert!(!origin_allowed(&allowed, "https://discordsays.com"));
    }

    #[test]
    fn mixed_list() {
        let allowed = vec![
            "https://kbve.com".to_string(),
            "https://*.discordsays.com".to_string(),
        ];
        assert!(origin_allowed(&allowed, "https://kbve.com"));
        assert!(origin_allowed(&allowed, "https://x.discordsays.com"));
        assert!(!origin_allowed(&allowed, "https://jobs.kbve.com"));
    }
}
```

- [ ] **Step 2: Run** `cargo test -p met origin_allowed` → FAIL (fn not defined)

- [ ] **Step 3: Implement.** Replace the `AllowOrigin::list` branch in `cors_layer` with a predicate when any entry contains `*.`, else keep list. Add:

```rust
fn origin_allowed(allowed: &[String], origin: &str) -> bool {
    allowed.iter().any(|entry| {
        if let Some((scheme, host_pat)) = entry.split_once("://") {
            if let Some(suffix) = host_pat.strip_prefix("*.") {
                return origin
                    .strip_prefix(scheme)
                    .and_then(|rest| rest.strip_prefix("://"))
                    .is_some_and(|host| {
                        host.strip_suffix(suffix)
                            .is_some_and(|lead| lead.ends_with('.') && lead.len() > 1)
                    });
            }
        }
        entry == origin
    })
}
```

In `cors_layer`, when `cfg.allowed_origins` is non-empty:

```rust
let allowed = cfg.allowed_origins.clone();
AllowOrigin::predicate(move |origin, _| {
    origin
        .to_str()
        .is_ok_and(|o| origin_allowed(&allowed, o))
})
```

(Keep the empty-list `AllowOrigin::any()` + warn branch.)

- [ ] **Step 4: Run** `cargo test -p met` → PASS; `cargo check -p met` clean
- [ ] **Step 5: Commit** `feat(met): wildcard origin support in CORS allowlist`

### Task 2: metrics deploy env — arpg origins

**Files:**
- Modify: `apps/kube/metrics/manifest/metrics-deployment.yaml:66`

- [ ] **Step 1:** Change `METRICS_ALLOWED_ORIGINS` value to `https://kbve.com,https://www.kbve.com,https://jobs.kbve.com,https://arpg.kbve.com,https://*.discordsays.com`
- [ ] **Step 2:** Commit `feat(kube): allow arpg + discordsays origins on metrics ingest`

### Task 3: jedi observ — config + event model + throttle

**Files:**
- Create: `packages/rust/jedi/src/observ/mod.rs`
- Modify: `packages/rust/jedi/Cargo.toml` (optional dep + feature), `packages/rust/jedi/src/lib.rs` (module export)

**Interfaces:**
- Produces: `ObservConfig { endpoint, project, environment, release }`, `ObservConfig::from_env() -> Option<ObservConfig>` (None when `OBSERV_ENDPOINT` unset/empty); `ObservEvent` serde struct matching met `ErrorEvent` wire shape; `Throttle::allow(callsite_id) -> Allow { allowed: bool, suppressed: u64 }` (10/min per callsite, monotonic clock).

- [ ] **Step 1:** Cargo.toml: add `tracing-subscriber = { version = "0.3", optional = true, default-features = false, features = ["registry", "std"] }`; feature `observ = ["dep:tracing-subscriber"]`.
- [ ] **Step 2: Failing tests** in `observ/mod.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn config_none_without_endpoint() {
        assert!(ObservConfig::from_parts(None, None, None, None).is_none());
    }

    #[test]
    fn config_defaults() {
        let c = ObservConfig::from_parts(
            Some("http://m:5500/api/v1/ingest/errors".into()),
            Some("arpg".into()),
            None,
            None,
        )
        .unwrap();
        assert_eq!(c.project, "arpg");
        assert_eq!(c.environment, "production");
    }

    #[test]
    fn throttle_allows_then_suppresses() {
        let t = Throttle::new(3, Duration::from_secs(60));
        for _ in 0..3 {
            assert!(t.allow(1).allowed);
        }
        let v = t.allow(1);
        assert!(!v.allowed);
        assert!(t.allow(2).allowed);
    }

    #[test]
    fn throttle_reports_suppressed_after_window() {
        let t = Throttle::new(1, Duration::from_millis(1));
        assert!(t.allow(1).allowed);
        assert!(!t.allow(1).allowed);
        std::thread::sleep(Duration::from_millis(5));
        let v = t.allow(1);
        assert!(v.allowed);
        assert_eq!(v.suppressed, 1);
    }
}
```

- [ ] **Step 3:** `cargo test -p jedi --features observ observ` → FAIL
- [ ] **Step 4: Implement:**

```rust
use dashmap::DashMap;
use serde::Serialize;
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct ObservConfig {
    pub endpoint: String,
    pub project: String,
    pub environment: String,
    pub release: Option<String>,
}

impl ObservConfig {
    pub fn from_env() -> Option<Self> {
        Self::from_parts(
            std::env::var("OBSERV_ENDPOINT").ok(),
            std::env::var("OBSERV_PROJECT").ok(),
            std::env::var("OBSERV_ENVIRONMENT").ok(),
            std::env::var("OBSERV_RELEASE").ok(),
        )
    }

    pub fn from_parts(
        endpoint: Option<String>,
        project: Option<String>,
        environment: Option<String>,
        release: Option<String>,
    ) -> Option<Self> {
        let endpoint = endpoint.filter(|e| !e.is_empty())?;
        Some(Self {
            endpoint,
            project: project.filter(|p| !p.is_empty()).unwrap_or_else(|| "unknown".into()),
            environment: environment
                .filter(|e| !e.is_empty())
                .unwrap_or_else(|| "production".into()),
            release,
        })
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct ObservEvent {
    pub project: String,
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release: Option<String>,
    pub environment: String,
    pub error_type: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    pub handled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

pub struct Allow {
    pub allowed: bool,
    pub suppressed: u64,
}

pub struct Throttle {
    max: u64,
    window: Duration,
    slots: DashMap<u64, (Instant, u64, u64)>,
}

impl Throttle {
    pub fn new(max: u64, window: Duration) -> Self {
        Self { max, window, slots: DashMap::new() }
    }

    pub fn allow(&self, callsite: u64) -> Allow {
        let now = Instant::now();
        let mut entry = self.slots.entry(callsite).or_insert((now, 0, 0));
        let (start, count, suppressed) = *entry;
        if now.duration_since(start) >= self.window {
            *entry = (now, 1, 0);
            return Allow { allowed: true, suppressed };
        }
        if count < self.max {
            entry.1 = count + 1;
            Allow { allowed: true, suppressed: 0 }
        } else {
            entry.2 = suppressed + 1;
            Allow { allowed: false, suppressed: 0 }
        }
    }
}
```

lib.rs: `#[cfg(feature = "observ")] pub mod observ;`

- [ ] **Step 5:** `cargo test -p jedi --features observ observ` → PASS
- [ ] **Step 6: Commit** `feat(jedi): observ config, event model, per-callsite throttle`

### Task 4: jedi observ — batcher + panic hook + tracing Layer

**Files:**
- Modify: `packages/rust/jedi/src/observ/mod.rs` (or split `layer.rs`/`sender.rs` submodules if mod.rs passes ~300 lines)

**Interfaces:**
- Consumes: Task 3 types.
- Produces: `pub fn init(cfg: Option<ObservConfig>) -> Option<ObservLayer>` — spawns flusher (needs tokio runtime), installs chained panic hook, returns Layer for `.with()`. `ObservLayer` implements `tracing_subscriber::Layer<S>`.

- [ ] **Step 1: Implement sender:** `Sender { tx: tokio::sync::mpsc::Sender<ObservEvent> }` bounded 1024, `try_send` drop-on-full. Flusher task: loop `tokio::select!` on `rx.recv()` + 5s tick; buffer flush at 32 or on tick when non-empty; POST `{"events":[...]}` JSON via shared `reqwest::Client` (5s timeout); on error `tracing::debug!`.
- [ ] **Step 2: Implement layer:**

```rust
impl<S> tracing_subscriber::Layer<S> for ObservLayer
where
    S: tracing::Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: tracing_subscriber::layer::Context<'_, S>) {
        let meta = event.metadata();
        if *meta.level() > tracing::Level::WARN || meta.target().starts_with("jedi::observ") {
            return;
        }
        let verdict = self.throttle.allow(callsite_hash(meta.callsite()));
        if !verdict.allowed {
            return;
        }
        let mut visitor = MessageVisitor::default();
        event.record(&mut visitor);
        self.sender.enqueue(self.build_event(meta, visitor.render(), verdict.suppressed));
    }
}
```

`MessageVisitor` implements `tracing::field::Visit`, captures `message` + other fields into one string. `build_event`: `error_type` = `meta.target()`, `url` = `format!("{}::{}:{}", meta.target(), meta.file().unwrap_or("?"), meta.line().unwrap_or(0))`, `handled` = true, `extra` = `{"suppressed": n}` when n > 0, plus `{"level": "warn"|"error"}`. The `meta.target()` self-skip guard prevents the debug-log feedback loop.
- [ ] **Step 3: Panic hook** in `init`: `std::panic::set_hook` chaining `prev`; capture `payload.downcast_ref::<&str>/<String>` + `location()`, `error_type = "panic"`, `handled: false`, enqueue via same sender.
- [ ] **Step 4: Compile-level test** (flusher needs runtime):

```rust
#[tokio::test]
async fn init_none_when_unconfigured() {
    assert!(init(None).is_none());
}

#[tokio::test]
async fn layer_composes_with_registry() {
    use tracing_subscriber::prelude::*;
    let cfg = ObservConfig::from_parts(Some("http://127.0.0.1:1/x".into()), Some("t".into()), None, None);
    let layer = init(cfg).unwrap();
    let _sub = tracing_subscriber::registry().with(layer);
}
```

- [ ] **Step 5:** `cargo test -p jedi --features observ` → PASS; also `cargo check -p jedi` (feature OFF still clean)
- [ ] **Step 6: Commit** `feat(jedi): observ tracing layer, batcher, panic hook`

### Task 5: arpg-server wiring + fleet env

**Files:**
- Modify: `apps/agones/arpg/server/Cargo.toml:18` (add `"observ"` to jedi features)
- Modify: `apps/agones/arpg/server/src/main.rs:21-26`
- Modify: `apps/kube/agones/arpg/manifests/` fleet/gameserver yaml (locate container env block)

**Interfaces:**
- Consumes: `jedi::observ::{init, ObservConfig}`.

- [ ] **Step 1:** Replace `tracing_subscriber::fmt()...init()` with registry composition:

```rust
use tracing_subscriber::prelude::*;

let filter = EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| "info,arpg_server=debug,simgrid=debug".into());
let observ = jedi::observ::init(jedi::observ::ObservConfig::from_env());
tracing_subscriber::registry()
    .with(filter)
    .with(tracing_subscriber::fmt::layer())
    .with(observ)
    .init();
```

(`Option<Layer>` implements `Layer`, so `.with(observ)` is a no-op when unconfigured. EnvFilter as registry layer filters all layers — same behavior as today.)
- [ ] **Step 2:** `cargo check -p arpg-server` clean.
- [ ] **Step 3:** Fleet manifest env: add `OBSERV_ENDPOINT=http://metrics.kbve.svc.cluster.local:5500/api/v1/ingest/errors`, `OBSERV_PROJECT=arpg`, `OBSERV_ENVIRONMENT=production`. Verify metrics svc name first: `rtk proxy grep -n "name:" apps/kube/metrics/manifest/*service*`.
- [ ] **Step 4: Commit** `feat(arpg): server error/warning telemetry via jedi observ`

### Task 6: Discord Activity initObserv

**Files:**
- Modify: `apps/agones/arpg/web/src/embed/discord.tsx` (URL_MAPPINGS ~line 30, boot init near top-level constants)

- [ ] **Step 1:** Add `{ prefix: '/arpg-metrics', target: 'metrics.kbve.com' }` to `URL_MAPPINGS`. Add import `import { initObserv } from '@kbve/observ';` and after `PROXY_HTTP` const:

```ts
initObserv({
	endpoint: `${PROXY_HTTP}/.proxy/arpg-metrics/api/v1/ingest/errors`,
	project: 'arpg',
	platform: 'web',
	environment: import.meta.env.MODE,
});
```

- [ ] **Step 2:** Build web: `./kbve.sh -nx arpg-web:build` (confirm project name via `rtk proxy grep -n '"name"' apps/agones/arpg/web/project.json`). Expected: build succeeds.
- [ ] **Step 3: Commit** `feat(arpg): discord activity error telemetry via metrics proxy mapping`

### Task 7: Final validation + PR

- [ ] **Step 1:** `cargo test -p jedi --features observ && cargo test -p met && cargo check -p arpg-server`
- [ ] **Step 2:** `git log --oneline origin/dev..HEAD` sanity; push `worktree-arpg-metrics`; PR → `dev`. PR body: summary + manual step (Discord dev portal `/arpg-metrics → metrics.kbve.com` mapping) + note cryptothrone follow-up.

## Self-review notes

- Spec coverage: Part 1 → Tasks 1-2; Part 2 → Task 6; Part 3 → Tasks 3-5; testing section → Tasks 1,3,4,7. Portal manual step → Task 7 PR body.
- Type consistency: `ObservConfig::from_parts` used by both tests and `from_env`; `init(Option<ObservConfig>) -> Option<ObservLayer>` consumed in Task 5.
