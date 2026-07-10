use anyhow::{Context, anyhow};
use std::net::SocketAddr;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Environment {
    Dev,
    Beta,
    Release,
}

impl Environment {
    pub fn as_str(self) -> &'static str {
        match self {
            Environment::Dev => "dev",
            Environment::Beta => "beta",
            Environment::Release => "release",
        }
    }

    fn parse(raw: &str) -> anyhow::Result<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "dev" | "development" => Ok(Environment::Dev),
            "beta" | "staging" => Ok(Environment::Beta),
            "release" | "prod" | "production" => Ok(Environment::Release),
            other => Err(anyhow!(
                "invalid OWS_ENV '{other}' (expected dev|beta|release)"
            )),
        }
    }

    fn requires_explicit_guid(self) -> bool {
        matches!(self, Environment::Beta | Environment::Release)
    }
}

/// Defaults are only safe in dev; for beta/release an unset value would silently collide
/// multiple tenants onto the same fleet/namespace, so require it explicitly there.
fn require_or_default(
    var: &str,
    default: &str,
    environment: Environment,
) -> anyhow::Result<String> {
    match std::env::var(var) {
        Ok(v) => Ok(v),
        Err(_) if environment.requires_explicit_guid() => Err(anyhow!(
            "{var} is required for OWS_ENV={}",
            environment.as_str()
        )),
        Err(_) => Ok(default.to_string()),
    }
}

#[derive(Clone)]
pub struct TenantConfig {
    pub customer_guid: Uuid,
    pub slug: String,
    pub environment: Environment,
}

/// Empty-server reaper knobs (all gated OFF / inert by default). Grouped so the six values
/// thread through the state builder as one argument instead of six positional primitives.
#[derive(Clone, Debug)]
pub struct ReaperKnobs {
    /// Master kill switch — the whole reaper loop no-ops when false.
    pub enabled: bool,
    /// Independently gates the time-based `NeverReported` path; keep off until the heartbeat
    /// is confirmed live in the target env, or it deallocates populated servers.
    pub never_reported: bool,
    /// Auto-safety for the `NeverReported` path. When true (default), never-reported reaping is
    /// suppressed until at least one heartbeat has *ever* been observed for the tenant. If UE isn't
    /// configured to heartbeat, none is ever seen, so populated servers are never reaped — the
    /// system detects "heartbeats not live" instead of relying on the operator to know.
    pub require_heartbeat: bool,
    /// `NeverReported` boot-grace window.
    pub boot_grace_secs: i64,
    /// Buffer added to the per-map empty timeout so the server's own `SDK.Shutdown()` wins first.
    pub buffer_secs: i64,
    /// Reap a still-"populated" instance whose heartbeat went stale this many seconds ago
    /// (crashed-while-populated). `0` = disabled. Only safe once heartbeats are reliably live.
    pub stale_secs: i64,
    /// Floor on the effective empty timeout so a freshly allocated server isn't reaped under a
    /// still-loading player even if a map is misconfigured with a tiny timeout.
    pub min_empty_secs: i64,
    /// Freshness window for the `Empty` reap: the empty marker is only trusted if the heartbeat
    /// arrived within this many seconds. A wedged/crashed heartbeat freezes the reported count at a
    /// stale `0` while players may have reconnected out-of-band; without this gate the reaper would
    /// hard-deallocate a populated-but-silent server. `0` = disabled (no freshness check).
    pub empty_fresh_secs: i64,
    /// Whether to stamp the `ows.kbve.com/empty-shutdown-minutes` allocation annotation that tells
    /// the UE server when to self-shutdown after going empty. Default ON: stamped even before a UE
    /// consumer reads it, so it's already present when one lands. Set `false` to skip the per-map
    /// timeout DB read on the allocation path and omit the annotation. Independent of `enabled`.
    pub stamp_empty_shutdown_annotation: bool,
}

impl Default for ReaperKnobs {
    fn default() -> Self {
        Self {
            enabled: false,
            never_reported: false,
            require_heartbeat: true,
            boot_grace_secs: 14400,
            buffer_secs: 30,
            stale_secs: 0,
            min_empty_secs: 300,
            empty_fresh_secs: 180,
            stamp_empty_shutdown_annotation: true,
        }
    }
}

/// Per-tenant overrides for the reaper knobs, read from the `ows.reaperconfig` table. Every field
/// is `Option`: `None` means "fall back to the env/default value", so a tenant can override any
/// subset. `ReaperKnobs::merged_with` applies these field-by-field (DB wins when present).
#[derive(Debug, Clone, Default, sqlx::FromRow)]
pub struct ReaperConfigOverride {
    // Postgres folds the unquoted DDL identifiers to concatenated lowercase (e.g. `NeverReported`
    // -> `neverreported`), matching the rest of the ows schema; map them back to snake_case fields.
    pub enabled: Option<bool>,
    #[sqlx(rename = "neverreported")]
    pub never_reported: Option<bool>,
    #[sqlx(rename = "requireheartbeat")]
    pub require_heartbeat: Option<bool>,
    #[sqlx(rename = "bootgracesecs")]
    pub boot_grace_secs: Option<i64>,
    #[sqlx(rename = "buffersecs")]
    pub buffer_secs: Option<i64>,
    #[sqlx(rename = "stalesecs")]
    pub stale_secs: Option<i64>,
    #[sqlx(rename = "minemptysecs")]
    pub min_empty_secs: Option<i64>,
    #[sqlx(rename = "emptyfreshsecs")]
    pub empty_fresh_secs: Option<i64>,
}

/// Fleet-restart control row, read from the `ows.fleet_restart` table (operator/dashboard-written,
/// one row per tenant). Drives the `fleet_restart_reconcile` job: `active=true` fans
/// `set_drain_state` across active instances and (when `lockout`) holds the admission lockout.
/// `lockout_applied` tracks lockout ownership so the reconcile only lifts a lockout it itself set
/// (the `admission_control` table is shared with other writers). Absent row / `active=false` = inert.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct FleetRestart {
    pub active: bool,
    pub reason: String,
    pub urgency: i16,
    #[sqlx(rename = "dropplayers")]
    pub drop_players: bool,
    pub stagger: bool,
    #[sqlx(rename = "batchsize")]
    pub batch_size: i32,
    pub lockout: bool,
    #[sqlx(rename = "lockoutapplied")]
    pub lockout_applied: bool,
    #[sqlx(rename = "startedat")]
    pub started_at: chrono::DateTime<chrono::Utc>,
    #[sqlx(rename = "draindeadline")]
    pub drain_deadline: Option<chrono::DateTime<chrono::Utc>>,
    /// Barrier latch: set once by the reconcile when `draining == 0 && gameservers == 0`. Past
    /// this the drain fan-out STOPS — any instance created later belongs to the new fleet (the old
    /// fleet was provably at 0) and must never be drained by this restart. `None` until converged;
    /// reset to `None` on (re)activation.
    #[sqlx(rename = "drainedat")]
    pub drained_at: Option<chrono::DateTime<chrono::Utc>>,
    #[sqlx(rename = "targetversion")]
    pub target_version: Option<String>,
    #[sqlx(rename = "requestid")]
    pub request_id: uuid::Uuid,
}

/// The tenant's `ows.deploy_state` row: the authoritative rollout target (`target_version` is a
/// PVC path version, not an image tag) plus rollout state. `rolled=true` ⇒ this version is the one
/// being served (the launcher's download target); `rolled=false` ⇒ merged but not yet rolled
/// (update pending). `health='unhealthy'` ⇒ a soak failed and a human must decide (no auto-rollback).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DeployState {
    #[sqlx(rename = "targetversion")]
    pub target_version: String,
    pub rolled: bool,
    pub health: String,
}

/// Per-scope admission override, read from the `ows.admission_control` table. `accept_new_joins`
/// is `Option`: `None` (or no row) means "fall back to the env baseline" (`ROWS_ACCEPT_NEW_JOINS`).
/// One of these is read per scope (tenant + global sentinel) and combined by
/// `effective_accept_new_joins` (either scope `Some(false)` closes the gate).
/// Built manually from the `get_admission_overrides` tuple query, not via `query_as`, so no
/// `sqlx::FromRow` derive is needed (the row→struct mapping lives in the repo).
#[derive(Debug, Clone, Default)]
pub struct AdmissionOverride {
    pub accept_new_joins: Option<bool>,
}

/// Pure admission-gate resolution. New joins are accepted unless EITHER scope explicitly closes the
/// gate: if the tenant row or the global sentinel row has `accept_new_joins = Some(false)`, return
/// `false`. Otherwise the most-specific present override wins (tenant before global), falling back
/// to the env baseline when neither scope has a row. Kept pure (no DB) so the join-path decision is
/// unit-testable.
pub fn effective_accept_new_joins(
    env: bool,
    tenant: &AdmissionOverride,
    global: &AdmissionOverride,
) -> bool {
    if tenant.accept_new_joins == Some(false) || global.accept_new_joins == Some(false) {
        return false;
    }
    tenant
        .accept_new_joins
        .or(global.accept_new_joins)
        .unwrap_or(env)
}

impl ReaperKnobs {
    /// Returns the effective knobs: the env-derived baseline (`self`) with any non-`None`
    /// per-tenant override applied. Env sets the floor; the DB row wins per field when present.
    pub fn merged_with(&self, ov: &ReaperConfigOverride) -> ReaperKnobs {
        ReaperKnobs {
            enabled: ov.enabled.unwrap_or(self.enabled),
            never_reported: ov.never_reported.unwrap_or(self.never_reported),
            require_heartbeat: ov.require_heartbeat.unwrap_or(self.require_heartbeat),
            boot_grace_secs: ov.boot_grace_secs.unwrap_or(self.boot_grace_secs),
            buffer_secs: ov.buffer_secs.unwrap_or(self.buffer_secs),
            stale_secs: ov.stale_secs.unwrap_or(self.stale_secs),
            min_empty_secs: ov.min_empty_secs.unwrap_or(self.min_empty_secs),
            empty_fresh_secs: ov.empty_fresh_secs.unwrap_or(self.empty_fresh_secs),
            // Env-only (no per-tenant DB override column): carried through from the baseline.
            stamp_empty_shutdown_annotation: self.stamp_empty_shutdown_annotation,
        }
    }

    /// Minimum value for the `empty-shutdown-minutes` annotation. The per-map
    /// `minutestoshutdownafterempty` defaults to 1 minute, which can self-terminate a server during
    /// UE5 map travel / asset streaming (a player mid-load); flooring the UE self-shutdown deadline
    /// at the same `min_empty_secs` the reaper uses for its own teardown protects against that.
    /// Returns `0` when the floor is disabled (`min_empty_secs <= 0`).
    pub fn empty_shutdown_minutes_floor(&self) -> i32 {
        if self.min_empty_secs <= 0 {
            return 0;
        }
        // ceil(min_empty_secs / 60), at least 1. saturating_add so an absurd value near i64::MAX
        // can't overflow the `+ 59`.
        ((self.min_empty_secs.saturating_add(59) / 60) as i32).max(1)
    }
}

fn env_bool(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_i64(key: &str, default: i64) -> i64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

pub struct RowsConfig {
    pub tenant: TenantConfig,
    pub database_url: String,
    pub rabbitmq_url: String,
    pub agones_namespace: String,
    pub agones_fleet: String,
    pub http_addr: SocketAddr,
    pub metrics_port: u16,
    pub docs_port: u16,
    pub reaper: ReaperKnobs,
    /// Env baseline for the new-join admission gate (`ROWS_ACCEPT_NEW_JOINS`, default `true`). Used
    /// when neither the tenant nor the global `admission_control` row overrides it.
    pub accept_new_joins: bool,
    /// Non-aggressive stall SLA: seconds a restart may sit `active` with `draining > 0` before it is
    /// declared stalled (surfaced on /fleet-restart/status and, at 2× this, auto-lifts the lockout).
    /// Env: ROWS_FLEET_RESTART_STALL_SECS. Default 1800 (30 min).
    pub fleet_restart_stall_secs: i64,
}

impl RowsConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let environment = match std::env::var("OWS_ENV") {
            Ok(raw) => Environment::parse(&raw)?,
            Err(_) => Environment::Dev,
        };

        let customer_guid = match std::env::var("OWS_API_KEY") {
            Ok(raw) => Uuid::parse_str(raw.trim())
                .with_context(|| format!("OWS_API_KEY '{raw}' is not a valid UUID"))?,
            Err(_) if environment.requires_explicit_guid() => {
                return Err(anyhow!(
                    "OWS_API_KEY (tenant customer_guid) is required for OWS_ENV={}",
                    environment.as_str()
                ));
            }
            Err(_) => {
                let ephemeral = Uuid::new_v4();
                tracing::warn!(
                    customer_guid = %ephemeral,
                    "OWS_API_KEY unset; generated ephemeral tenant for dev — state will not persist across restarts"
                );
                ephemeral
            }
        };

        // L2 (mandatory): the global admission sentinel is the all-zeros GUID. A tenant configured
        // with the nil GUID would alias the sentinel — `WHERE customerguid = tenant OR = global`
        // collapses and a tenant freeze silently becomes a game-wide freeze (or vice-versa). Fail
        // fast at startup with a clear message rather than mid-request. (Uuid::new_v4 above can never
        // produce nil, so this only guards an explicitly-set OWS_API_KEY.)
        if customer_guid == Uuid::nil() {
            return Err(anyhow!(
                "OWS_API_KEY (tenant customer_guid) must not be the all-zeros GUID \
                 (collides with the global admission sentinel)"
            ));
        }

        let slug = std::env::var("OWS_TENANT_SLUG").unwrap_or_else(|_| "default".into());

        // Route DB/MQ URLs through require_or_default like the other tenant-critical vars: dev gets
        // the localhost default, but beta/release ERROR on a missing secret instead of silently
        // connecting to localhost (a confusing failure when a secret is misconfigured).
        let database_url = require_or_default(
            "DATABASE_URL",
            "postgres://postgres:postgres@localhost:5432/ows",
            environment,
        )?;
        let rabbitmq_url = require_or_default(
            "RABBITMQ_URL",
            "amqp://dev:test@localhost:5672",
            environment,
        )?;
        let agones_namespace = require_or_default("AGONES_NAMESPACE", "ows", environment)?;
        let agones_fleet = require_or_default("AGONES_FLEET", "ows-hubworld", environment)?;

        let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
        let port: u16 = std::env::var("HTTP_PORT")
            .unwrap_or_else(|_| "4322".into())
            .parse()
            .context("HTTP_PORT must be a u16")?;
        let http_addr: SocketAddr = format!("{host}:{port}")
            .parse()
            .with_context(|| format!("invalid HTTP bind address {host}:{port}"))?;

        let metrics_port: u16 = std::env::var("METRICS_PORT")
            .unwrap_or_else(|_| "4324".into())
            .parse()
            .unwrap_or(4324);
        let docs_port: u16 = std::env::var("DOCS_PORT")
            .unwrap_or_else(|_| "4323".into())
            .parse()
            .unwrap_or(4323);

        // Empty-server reaper knobs. Booleans default OFF: the reaper ships inert and the
        // time-based paths stay gated until a live heartbeat is confirmed (see reaper safety note).
        let reaper = ReaperKnobs {
            enabled: env_bool("ROWS_EMPTY_REAPER_ENABLED", false),
            never_reported: env_bool("ROWS_REAP_NEVER_REPORTED", false),
            require_heartbeat: env_bool("ROWS_REAP_REQUIRE_HEARTBEAT", true),
            boot_grace_secs: env_i64("ROWS_EMPTY_REAP_BOOT_GRACE_SECS", 14400),
            buffer_secs: env_i64("ROWS_EMPTY_REAP_BUFFER_SECS", 30),
            stale_secs: env_i64("ROWS_EMPTY_REAP_STALE_SECS", 0),
            min_empty_secs: env_i64("ROWS_EMPTY_REAP_MIN_EMPTY_SECS", 300),
            empty_fresh_secs: env_i64("ROWS_EMPTY_REAP_FRESH_SECS", 180),
            stamp_empty_shutdown_annotation: env_bool("ROWS_STAMP_EMPTY_SHUTDOWN_ANNOTATION", true),
        };

        // Admission gate env baseline. Defaults `true` (accept new joins) so the gate ships inert —
        // a freeze requires either an env override or an `admission_control` DB row.
        let accept_new_joins = env_bool("ROWS_ACCEPT_NEW_JOINS", true);

        let fleet_restart_stall_secs = env_i64("ROWS_FLEET_RESTART_STALL_SECS", 1800);

        Ok(Self {
            tenant: TenantConfig {
                customer_guid,
                slug,
                environment,
            },
            database_url,
            rabbitmq_url,
            agones_namespace,
            agones_fleet,
            http_addr,
            metrics_port,
            docs_port,
            reaper,
            accept_new_joins,
            fleet_restart_stall_secs,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // No DB override row -> the env/default baseline is used unchanged.
    #[test]
    fn merge_empty_override_keeps_baseline() {
        let base = ReaperKnobs::default();
        let merged = base.merged_with(&ReaperConfigOverride::default());
        assert!(!merged.enabled);
        assert!(!merged.never_reported);
        assert!(merged.require_heartbeat);
        assert_eq!(merged.boot_grace_secs, 14400);
        assert_eq!(merged.min_empty_secs, 300);
    }

    // A per-tenant row overrides each present field; absent fields fall back to baseline.
    #[test]
    fn merge_applies_present_fields_only() {
        let base = ReaperKnobs::default();
        let ov = ReaperConfigOverride {
            enabled: Some(true),
            never_reported: Some(true),
            require_heartbeat: None, // not overridden -> baseline (true)
            boot_grace_secs: Some(60),
            buffer_secs: None,
            stale_secs: Some(120),
            min_empty_secs: None,
            empty_fresh_secs: None, // not overridden -> baseline (180)
        };
        let merged = base.merged_with(&ov);
        assert!(merged.enabled); // overridden
        assert!(merged.never_reported); // overridden
        assert!(merged.require_heartbeat); // baseline kept
        assert_eq!(merged.boot_grace_secs, 60); // overridden
        assert_eq!(merged.buffer_secs, 30); // baseline kept
        assert_eq!(merged.stale_secs, 120); // overridden
        assert_eq!(merged.min_empty_secs, 300); // baseline kept
    }

    // A tenant can disable the heartbeat auto-gate explicitly even when env defaults it on.
    #[test]
    fn merge_can_disable_require_heartbeat() {
        let base = ReaperKnobs::default();
        let ov = ReaperConfigOverride {
            require_heartbeat: Some(false),
            ..Default::default()
        };
        assert!(!base.merged_with(&ov).require_heartbeat);
    }

    // Admission gate closes if EITHER scope (tenant or global) is explicitly false; otherwise the
    // present scope wins, falling back to the env baseline when both are absent.
    #[test]
    fn admission_gate_closed_if_either_scope_false() {
        let off = AdmissionOverride {
            accept_new_joins: Some(false),
        };
        let on = AdmissionOverride {
            accept_new_joins: Some(true),
        };
        let none = AdmissionOverride::default();
        assert!(!effective_accept_new_joins(true, &off, &none)); // tenant closed
        assert!(!effective_accept_new_joins(true, &none, &off)); // global closed
        assert!(effective_accept_new_joins(true, &on, &none)); // open
        assert!(effective_accept_new_joins(true, &none, &none)); // env baseline
        assert!(!effective_accept_new_joins(false, &none, &none)); // env off
        // A `false` in either scope wins over a `true` in the other: a tenant cannot reopen a global
        // freeze, and a global `true` cannot override a tenant freeze.
        assert!(!effective_accept_new_joins(true, &on, &off)); // tenant true, global frozen
        assert!(!effective_accept_new_joins(true, &off, &on)); // tenant frozen, global true
    }

    // the annotation floor is ceil(min_empty_secs / 60), at least 1; 0 disables it.
    #[test]
    fn empty_shutdown_minutes_floor_ceils_and_clamps() {
        let floor = |secs: i64| {
            ReaperKnobs {
                min_empty_secs: secs,
                ..ReaperKnobs::default()
            }
            .empty_shutdown_minutes_floor()
        };
        assert_eq!(floor(300), 5); // exact
        assert_eq!(floor(301), 6); // ceils up
        assert_eq!(floor(59), 1); // sub-minute clamps to 1
        assert_eq!(floor(30), 1); // at least 1 when floor enabled
        assert_eq!(floor(0), 0); // floor disabled -> no minimum
        assert_eq!(floor(-5), 0); // negative treated as disabled
    }
}
