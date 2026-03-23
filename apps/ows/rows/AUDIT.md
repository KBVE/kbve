# ROWS Audit — Drop-in Replacement for OWS C#

## Current State (3,284 lines Rust)

ROWS has the skeleton for a full OWS replacement. REST + gRPC dual-protocol, Agones
integration, RabbitMQ consumer, Postgres via sqlx. Needs completion and hardening
before it can replace the 5 C# microservices.

## What Works

- [x] REST router with axum (health, login, register, characters, instances, zones)
- [x] gRPC service definitions (466 lines)
- [x] Postgres connection pool via sqlx
- [x] Agones allocator (GameServerAllocation create/delete)
- [x] RabbitMQ consumer (lapin)
- [x] JWT auth (jsonwebtoken)
- [x] Argon2 password hashing (replaces pgcrypto crypt/gen_salt)
- [x] CustomerGUID middleware
- [x] Structured tracing (tracing-subscriber)
- [x] DashMap for in-memory zone→GameServer tracking
- [x] Error types (thiserror)

## Critical Path — Must Complete to Replace OWS

### 1. Database Search Path

**Priority: P0**

OWS C# fails because Npgsql 8.x dropped `Search Path` support. ROWS uses sqlx which
handles `options=-c search_path=ows,extensions,public` natively in the connection URL.
Verify this works end-to-end.

- [ ] Confirm sqlx respects `options` parameter in DATABASE_URL
- [ ] Test login query with crypt() from extensions schema
- [ ] Test all queries against the ows schema

### 2. Login + Session Flow

**Priority: P0**

The game client's first call. Must return `UserSessionGUID` exactly matching the OWS
JSON response format.

- [ ] `POST /api/Users/LoginAndCreateSession` — bcrypt verify via argon2 or pgcrypto
- [ ] Password hashing: OWS uses pgcrypto `crypt(password, gen_salt('bf'))`. ROWS needs
      to either use the same bcrypt format or migrate passwords to argon2.
      **Decision needed: keep pgcrypto bcrypt (SQL-side) or switch to argon2 (app-side)?**
- [ ] Session creation: DELETE old sessions, INSERT new with gen_random_uuid()
- [ ] Response format: `{"authenticated":true,"userSessionGuid":"...","errorMessage":""}`

### 3. Character CRUD

**Priority: P0**

- [ ] `GetAllCharacters` — full character JSON with all 90+ stat fields
- [ ] `CreateCharacterUsingDefaultCharacterValues` — copy from DefaultCharacterValues
- [ ] `GetByName` (PublicAPI variant) — character + custom data
- [ ] `GetByName` (CharacterPersistence variant) — full stats
- [ ] `UpdateCharacterStats` — bulk stat update
- [ ] `GetCustomData` / `AddOrUpdateCustomData` — JSON key-value store
- [ ] `RemoveCharacter` — cascade delete
- [ ] `PlayerLogout` — update last activity

### 4. Zone Connection Flow

**Priority: P0**

This is what's currently broken in OWS C#. ROWS must handle:

- [ ] `SetSelectedCharacterAndGetUserSession` — set selected char, return zone info
- [ ] `GetServerToConnectTo` — find or spin up a zone server instance
    - Query Maps for zone → get WorldServer → check MapInstances
    - If no instance: call InstanceManagement SpinUpServerInstance
    - Poll for MapInstance status=2 (ready)
    - Return ServerIP:Port to client
- [ ] `JoinMapByCharName` — the complex CTE that finds/creates MapInstances
- [ ] MapInstance lifecycle (create, status update, cleanup)

### 5. Instance Management

**Priority: P1**

- [ ] `SpinUpServerInstance` — create Agones GameServerAllocation (already in agones.rs)
- [ ] `UpdateNumberOfPlayers` — game server heartbeat
- [ ] `ShutDownServerInstance` — delete GameServer
- [ ] `RegisterLauncher` / `StartInstanceLauncher` — WorldServer registration
    - **Fix: use stable ZoneServerGUID to prevent row spam on restart**
- [ ] `SetZoneInstanceStatus` — mark zone ready/shutdown
- [ ] `GetZoneInstancesForWorldServer` — list active instances

### 6. RabbitMQ Integration

**Priority: P1**

- [ ] Consume `ows.serverspinup.{WorldServerID}` messages
- [ ] Consume `ows.servershutdown.{WorldServerID}` messages
- [ ] Trigger Agones allocation on spin-up
- [ ] Trigger Agones deallocation on shutdown
- [ ] Dead letter handling for failed allocations

### 7. World Server Management

**Priority: P1**

- [ ] Prevent duplicate WorldServer rows (use upsert with stable GUID)
- [ ] Set ServerStatus=1 after successful registration
- [ ] Health monitoring loop (check zone instances, clean stale)
- [ ] Graceful shutdown (deallocate all GameServers, set status=0)

## Improvements Over OWS C#

### 8. Single Binary

**Priority: P2**

ROWS replaces 5 C# microservices + 1 instance launcher = 6 deployments → 1 deployment.

- [ ] Merge all API routes into one binary (PublicAPI + CharacterPersistence +
      InstanceManagement + GlobalData + Management)
- [ ] Single Dockerfile, single kube deployment
- [ ] Single connection pool (not 5 separate ones)
- [ ] Remove all 5 OWS C# deployments from kube manifests

### 9. Proper Error Handling

**Priority: P2**

OWS C# swallows exceptions and returns empty 500s. ROWS must:

- [ ] Return structured error JSON: `{"error":"message","code":"ERROR_CODE"}`
- [ ] Log every error with tracing spans (request ID, customer GUID, endpoint)
- [ ] Never return empty 500 — always include error context

### 10. Password Migration

**Priority: P2**

Existing users have pgcrypto bcrypt hashes. Options:

- **Option A**: Keep using pgcrypto crypt() in SQL (zero migration, but ties auth to DB)
- **Option B**: Migrate to argon2 on first login (dual-check: try argon2, fallback to
  pgcrypto, re-hash with argon2 on success)
- **Option C**: Bulk migrate all passwords (requires knowing plaintext — not possible)

**Recommendation: Option A for now (pgcrypto), Option B later.**

### 11. Agones Native

**Priority: P2**

- [ ] GameServerAllocation on zone spin-up (already implemented in agones.rs)
- [ ] GameServer deletion on zone shutdown
- [ ] Fleet scaling based on demand
- [ ] Re-add FleetAutoscaler once stable
- [ ] Health reporting from game server → ROWS (replace heartbeat HTTP calls)

### 12. Observability

**Priority: P3**

- [ ] Prometheus metrics endpoint (/metrics)
- [ ] Request latency histograms per endpoint
- [ ] Active sessions gauge
- [ ] Active game servers gauge
- [ ] RabbitMQ consumer lag
- [ ] Database query latency

### 13. gRPC for Game Servers

**Priority: P3**

Game servers currently use HTTP POST for heartbeats and status updates. gRPC would be
more efficient for high-frequency server→backend calls.

- [ ] gRPC service for UpdateNumberOfPlayers (already defined in proto)
- [ ] gRPC service for SetZoneInstanceStatus
- [ ] Game server connects via gRPC instead of HTTP
- [ ] Bi-directional streaming for real-time server health

## Migration Plan

1. **Phase 1**: Get ROWS login + character flow working (P0 items)
2. **Phase 2**: Get zone connection working with Agones (P0 + P1)
3. **Phase 3**: Deploy ROWS alongside OWS C# (shadow mode, compare responses)
4. **Phase 4**: Switch HTTPRoute from OWS to ROWS
5. **Phase 5**: Remove OWS C# deployments

## Files Reference

| File          | Lines     | Purpose                      |
| ------------- | --------- | ---------------------------- |
| main.rs       | 106       | Entrypoint, server setup     |
| rest.rs       | 732       | All REST endpoints (axum)    |
| grpc.rs       | 466       | gRPC service implementation  |
| repo.rs       | 694       | Database queries (sqlx)      |
| models.rs     | 191       | Data models                  |
| agones.rs     | 140       | Agones GameServer allocation |
| mq.rs         | 110       | RabbitMQ consumer            |
| state.rs      | 88        | App state (pools, config)    |
| middleware.rs | 46        | CustomerGUID extraction      |
| error.rs      | 102       | Error types                  |
| db.rs         | 57        | Connection pool setup        |
| trace.rs      | 76        | Tracing/logging setup        |
| convert.rs    | 82        | Type conversions             |
| service/\*.rs | 394       | Business logic layer         |
| **Total**     | **3,284** |                              |
