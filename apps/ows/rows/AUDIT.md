# ROWS Audit — Drop-in Replacement for OWS C#

## Current State (~4,200 lines Rust)

ROWS is a functionally complete OWS replacement. REST + gRPC + WebSocket triple-protocol,
transport-agnostic service layer, Agones integration, RabbitMQ producer + consumer,
Postgres via sqlx. Production-hardened with graceful shutdown, deep health probes,
CORS, body limits, and structured tracing.

## What Works

- [x] REST router with axum (30+ endpoints matching C# OWS paths)
- [x] gRPC service implementation (all 4 services wired through OWSService)
- [x] WebSocket adapter (JSON-RPC on /ws)
- [x] Postgres connection pool via sqlx
- [x] Agones allocator (GameServerAllocation create/delete)
- [x] RabbitMQ producer + consumer (lapin 4.3)
- [x] Dual password auth: pgcrypto bcrypt (SQL-side) + argon2 fallback (app-side)
- [x] CustomerGUID middleware
- [x] Structured tracing with per-request UUID spans (ClickHouse-ready)
- [x] DashMap session cache + zone→GameServer tracking
- [x] Typed error responses (Cow + &'static str codes, no json! macro)
- [x] Transport-agnostic service layer (ECS-inspired, 6 domain modules)
- [x] Graceful shutdown (SIGTERM/SIGINT)
- [x] Deep health (/health liveness + /ready DB probe)
- [x] CORS + 10MB body limit
- [x] Background health monitoring job
- [x] Dockerfile + Nx project.json
- [x] Zero serde_json::Value in handler returns
- [x] Zero-alloc position update parsing

## Critical Path — Must Complete to Replace OWS

### 1. Database Search Path

**Priority: P0**

- [x] sqlx PgConnectOptions.options() sets search_path=ows,extensions,public at connect time
- [ ] Integration test: login query with crypt() from extensions schema
- [ ] Integration test: all queries against the ows schema

### 2. Login + Session Flow

**Priority: P0**

- [x] `POST /api/Users/LoginAndCreateSession` — pgcrypto crypt() SQL-side + argon2 fallback
- [x] Session creation: DELETE old sessions, INSERT new
- [x] Response format matches OWS C#
- [x] Password decision: Option A (pgcrypto) implemented with Option B (argon2 fallback)

### 3. Character CRUD

**Priority: P0**

- [x] `GetAllCharacters` — full character JSON with all 90+ stat fields
- [x] `CreateCharacterUsingDefaultCharacterValues` — copy from DefaultCharacterValues
- [x] `GetByName` (PublicAPI variant) — character lookup
- [x] `GetByName` (CharacterPersistence variant) — full stats
- [x] `UpdateCharacterStats` — allowlisted 50-column dynamic UPDATE
- [x] `GetCustomData` / `AddOrUpdateCustomData` — key-value store
- [x] `RemoveCharacter` — cascade delete
- [x] `PlayerLogout` — clear map assignment

### 4. Zone Connection Flow

**Priority: P0**

- [x] `SetSelectedCharacterAndGetUserSession` — set selected char, return session
- [x] `GetServerToConnectTo` — zone lookup + MQ spin-up if needed
- [x] `JoinMapByCharName` — find ready instance or signal spin-up
- [x] MapInstance lifecycle (status update, cleanup via background job)

### 5. Instance Management

**Priority: P1**

- [x] `SpinUpServerInstance` — Agones GameServerAllocation
- [x] `UpdateNumberOfPlayers` — game server heartbeat
- [x] `ShutDownServerInstance` — GameServer deletion via Agones
- [x] `RegisterLauncher` / `StartInstanceLauncher` — WorldServer registration
- [x] `SetZoneInstanceStatus` — mark zone ready/shutdown
- [x] `GetZoneInstancesForWorldServer` — list active instances
- [x] Fix: use stable ZoneServerGUID upsert to prevent row spam on restart

### 6. RabbitMQ Integration

**Priority: P1**

- [x] Consume `ows.serverspinup.{WorldServerID}` messages
- [x] Consume `ows.servershutdown.{WorldServerID}` messages
- [x] Trigger Agones allocation on spin-up
- [x] Trigger Agones deallocation on shutdown
- [x] Dead letter handling for failed allocations (reject after 3 retries)

### 7. World Server Management

**Priority: P1**

- [x] Prevent duplicate WorldServer rows (upsert with stable ZoneServerGUID)
- [x] Health monitoring loop (background job, 30s interval)
- [x] Graceful shutdown (SIGTERM/SIGINT handler)

## Improvements Over OWS C#

### 8. Single Binary

**Priority: P2** — DONE

- [x] All API routes in one binary (PublicAPI + CharacterPersistence + InstanceManagement + GlobalData + Abilities + Zones)
- [x] Single Dockerfile, single kube deployment
- [x] Single connection pool
- [ ] Remove all 5 OWS C# deployments from kube manifests

### 9. Proper Error Handling

**Priority: P2** — DONE

- [x] Typed ApiErrorBody with Cow<str> + &'static str code
- [x] Per-request tracing spans (request ID, customer GUID, method, path, latency)
- [x] Never returns empty 500

### 10. Password Migration

**Priority: P2** — DONE (Option A+B hybrid)

- [x] pgcrypto crypt() SQL-side for existing bcrypt hashes
- [x] Argon2 fallback for migrated passwords
- [x] Auto re-hash to argon2 on successful pgcrypto login (fire-and-forget background task)

### 11. Agones Native

**Priority: P2**

- [x] GameServerAllocation on zone spin-up
- [x] GameServer deletion on zone shutdown
- [ ] Fleet scaling based on demand
- [ ] FleetAutoscaler integration
- [x] UpdateNumberOfPlayers heartbeat endpoint

### 12. Observability

**Priority: P3**

- [ ] Prometheus metrics endpoint (/metrics)
- [ ] Request latency histograms per endpoint
- [x] Active sessions gauge (via /ready endpoint)
- [x] Active game servers gauge (via /ready endpoint)
- [ ] RabbitMQ consumer lag
- [ ] Database query latency

### 13. gRPC for Game Servers

**Priority: P3**

- [x] gRPC service for SetZoneInstanceStatus
- [x] gRPC service for UpdatePosition
- [x] gRPC service for UpdateNumberOfPlayers
- [ ] Bi-directional streaming for real-time server health

## Remaining Work

1. **Integration tests** — test login, character CRUD, zone connection against real DB
2. **CI pipeline entry** — add to dispatch manifest for automated builds
3. **Prometheus metrics** — /metrics endpoint
4. **FleetAutoscaler integration** — Agones fleet scaling
5. **Bi-directional gRPC streaming** — real-time server health
6. **Remove C# OWS deployments** — after validation

## Migration Plan

1. **Phase 1**: ~~Get ROWS login + character flow working~~ DONE
2. **Phase 2**: ~~Get zone connection working with Agones~~ DONE
3. **Phase 3**: ~~Production hardening (shutdown, health, CORS, body limits)~~ DONE
4. **Phase 4**: Deploy ROWS, switch HTTPRoute from OWS to ROWS
5. **Phase 5**: Remove OWS C# deployments
