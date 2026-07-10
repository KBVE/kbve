# ARPG Telemetry Integration — Design

Date: 2026-07-02
Status: approved (brainstorm w/ Al)

## Goal

Wire apps/agones/arpg (web client, Discord Activity, Rust game server) into the
in-house metrics platform (metrics.kbve.com → ClickHouse telemetry DB) for
error/warning tracking. Web client already calls `initObserv` (PR #13631) but is
dead on arrival: the deployed CORS allowlist has no arpg origin.

## Part 1 — Metrics service: CORS wildcard + allowlist

- `apps/metrics/src/main.rs` `cors_layer`: allowlist entries beginning `*.`
  switch the layer to `AllowOrigin::predicate`; predicate suffix-matches
  (`https://` scheme + `.domain` suffix) wildcard entries and exact-matches the
  rest. Mixed exact/wildcard list supported. Empty list keeps existing
  any-origin + warn behavior.
- `apps/kube/metrics/manifest/metrics-deployment.yaml`:
  `METRICS_ALLOWED_ORIGINS` gains `https://arpg.kbve.com` and
  `https://*.discordsays.com`.

## Part 2 — Discord Activity surface

- `apps/agones/arpg/web/src/embed/discord.tsx`: add
  `{ prefix: '/arpg-metrics', target: 'metrics.kbve.com' }` to `URL_MAPPINGS`;
  call `initObserv` at boot with endpoint
  `${PROXY_HTTP}/.proxy/arpg-metrics/api/v1/ingest/errors`, `project: 'arpg'`,
  `platform: 'web'`, `environment` from build mode. The auto-captured
  `location.href` (discordsays origin) distinguishes the Discord surface from
  arpg.kbve.com in the dashboard.
- Manual step (Al): add the `/arpg-metrics → metrics.kbve.com` URL mapping in
  the Discord developer portal. Until then the Activity POSTs 404 through the
  proxy; observ transport swallows failures, so inert not broken.

## Part 3 — jedi `observ` feature: server-side bridge

New module `jedi::observ` behind feature `observ` (deps: reqwest, tracing,
tracing-subscriber registry traits, tokio, serde_json — reuse jedi's existing
versions).

- `ObservConfig::from_env()` — `OBSERV_ENDPOINT`, `OBSERV_PROJECT`,
  `OBSERV_ENVIRONMENT`, `OBSERV_RELEASE`. Missing endpoint ⇒ bridge inert
  (init returns no-op; local dev stays clean).
- `ObservLayer: tracing_subscriber::Layer` — captures WARN + ERROR events.
  Mapping: `error_type` = event target, `message` = formatted message+fields,
  `platform` = `server`, `url` = `target::file:line` logical locator,
  `handled` = true. Per-callsite throttle: max 10 events/min per callsite;
  suppressed counter emitted in `extra.suppressed` on the next allowed event.
- Panic hook — `std::panic::set_hook` chaining the previous hook; captures
  payload + location as `handled: false`; best-effort synchronous-ish flush.
- Batcher — bounded tokio mpsc, `try_send` (drop on full; never blocks the
  game tick), background task flushes at 32 events or 5s. One POST per batch
  keeps the per-IP 120/min ingest limit irrelevant.
- Transport failures log at `debug` only — no ERROR→capture→fail feedback
  loop. Capture path must never panic.

### Wiring

- `apps/agones/arpg/server`: enable jedi `observ`; register layer on the
  existing `tracing_subscriber` registry in `main.rs`; install panic hook.
- `apps/kube/agones/arpg` fleet manifest: `OBSERV_ENDPOINT`
  (`http://metrics.kbve.svc.cluster.local:5500/api/v1/ingest/errors`),
  `OBSERV_PROJECT=arpg`, `OBSERV_ENVIRONMENT=production`.
- Cryptothrone server: NOT wired in this PR; follow-up one-liner.

## Testing

- jedi unit tests: throttle window, event→ErrorEvent mapping, config parsing,
  inert-when-unset.
- metrics unit test: wildcard predicate (accept subdomain, reject lookalike
  `evildiscordsays.com`, exact entries still match).
- `cargo check` (kbve.sh nx pipeline) for jedi, arpg-server, met.
- Web: vite build of arpg web.
- Live verify post-deploy via /dashboard/telemetry.

## Out of scope

- Perf/product lenses, source-map symbolication.
- Cryptothrone server + Unreal (rentearth) clients.
- Ingest token enforcement (`METRICS_INGEST_TOKEN` stays unset).
