# ROWS Extended Audit — Deep Dive into OWS Core

Source: `chuck/OWS/src/` (17,025 lines C#)

---

## Architecture Overview

OWS is 9 projects, 6 deployable services:

| Project                   | Lines | Deployable | Purpose                                           |
| ------------------------- | ----- | ---------- | ------------------------------------------------- |
| OWSData                   | 8,886 | No         | SQL queries, models, repository implementations   |
| OWSPublicAPI              | 2,033 | Yes        | Player-facing REST API (login, characters, zones) |
| OWSInstanceManagement     | 1,282 | Yes        | Server lifecycle (spin up/down, heartbeat, zones) |
| OWSCharacterPersistence   | 1,227 | Yes        | Character stats, abilities, custom data           |
| OWSInstanceLauncher       | 1,069 | Yes        | RabbitMQ consumer → Process.Start / Agones        |
| OWSShared                 | 888   | No         | Middleware, options, messages, interfaces         |
| OWSExternalLoginProviders | 622   | No         | Epic/Xsolla auth (not used by Chuck)              |
| OWSManagement             | 401   | Yes        | Admin Vue panel + user CRUD                       |
| OWSGlobalData             | 398   | Yes        | Key-value store                                   |

ROWS replaces all 6 deployable services with 1 binary (3,284 lines Rust).

---

## OWSData — The Core (8,886 lines)

Everything flows through OWSData. This is what ROWS must replicate.

### SQL Queries (1,346 lines)

Two files matter for Postgres:

| File               | Lines | Queries | Notes                             |
| ------------------ | ----- | ------- | --------------------------------- |
| GenericQueries.cs  | 801   | 52      | Shared across DB backends         |
| PostgresQueries.cs | 188   | 22      | Postgres-specific (CTEs, upserts) |

#### GenericQueries (52 queries) — ROWS coverage:

| Query                                         | ROWS | Priority | Category    |
| --------------------------------------------- | ---- | -------- | ----------- |
| PlayerLoginAndCreateSession                   | [x]  | P0       | Auth        |
| AddUser                                       | [x]  | P0       | Auth        |
| Logout                                        | [x]  | P1       | Auth        |
| GetUserSession                                | [x]  | P0       | Auth        |
| UserSessionSetSelectedCharacter               | [ ]  | P0       | Auth        |
| GetAllCharacters                              | [x]  | P0       | Characters  |
| GetCharacterByName                            | [x]  | P0       | Characters  |
| GetCharByCharName                             | [x]  | P0       | Characters  |
| GetCharacterIDByName                          | [ ]  | P1       | Characters  |
| CreateCharacterSQL                            | [x]  | P0       | Characters  |
| RemoveCharacter                               | [x]  | P1       | Characters  |
| UpdateCharacterStats                          | [x]  | P0       | Characters  |
| UpdateCharacterPosition                       | [x]  | P1       | Characters  |
| UpdateCharacterPositionAndMap                 | [ ]  | P1       | Characters  |
| UpdateCharacterZone                           | [ ]  | P1       | Characters  |
| GetCharacterCustomDataByName                  | [x]  | P0       | Custom Data |
| HasCustomCharacterDataForField                | [ ]  | P1       | Custom Data |
| AddCharacterCustomDataField                   | [x]  | P0       | Custom Data |
| UpdateCharacterCustomDataField                | [x]  | P0       | Custom Data |
| GetDefaultCustomCharacterDataByDefaultSetName | [ ]  | P0       | Custom Data |
| AddDefaultCustomCharacterData                 | [ ]  | P1       | Custom Data |
| GetAbilities                                  | [x]  | P1       | Abilities   |
| GetCharacterAbilities                         | [x]  | P1       | Abilities   |
| GetCharacterAbilityByName                     | [ ]  | P2       | Abilities   |
| GetCharacterAbilityBars                       | [x]  | P1       | Abilities   |
| GetCharacterAbilityBarsAndAbilities           | [x]  | P1       | Abilities   |
| GetPlayerGroupsCharacterIsIn                  | [ ]  | P2       | Social      |
| GetPlayerGroupIDByType                        | [ ]  | P2       | Social      |
| GetCustomer                                   | [x]  | P0       | Core        |
| GetMapByZoneName                              | [x]  | P0       | Maps        |
| GetZoneName                                   | [ ]  | P1       | Maps        |
| GetWorldByID                                  | [ ]  | P1       | World       |
| GetActiveWorldServersByLoad                   | [ ]  | P1       | World       |
| GetPortsInUseByWorldServer                    | [ ]  | P1       | World       |
| UpdateWorldServerStatus                       | [ ]  | P1       | World       |
| GetMapInstance                                | [x]  | P0       | Instances   |
| GetMapInstancesByIpAndPort                    | [ ]  | P2       | Instances   |
| GetMapInstanceStatus                          | [x]  | P0       | Instances   |
| UpdateMapInstanceStatus                       | [x]  | P0       | Instances   |
| RemoveMapInstances                            | [ ]  | P1       | Instances   |
| RemoveAllMapInstancesForWorldServer           | [ ]  | P1       | Instances   |
| RemoveAllCharactersFromAllInstancesByWorldID  | [ ]  | P1       | Instances   |
| RemoveCharacterFromAllInstances               | [ ]  | P1       | Instances   |
| RemoveCharacterFromInstances                  | [ ]  | P1       | Instances   |
| AddCharacterToInstance                        | [ ]  | P1       | Instances   |
| AddGlobalData                                 | [x]  | P1       | Global      |
| GetGlobalDataByGlobalDataKey                  | [x]  | P1       | Global      |
| UpdateGlobalData                              | [x]  | P1       | Global      |
| GetUser                                       | [ ]  | P2       | Admin       |
| GetUsers                                      | [ ]  | P3       | Admin       |
| UpdateUser                                    | [ ]  | P3       | Admin       |

**Coverage: 26/52 (50%)**

#### PostgresQueries (22 queries) — ROWS coverage:

| Query                                    | ROWS | Priority | Notes                               |
| ---------------------------------------- | ---- | -------- | ----------------------------------- |
| AddOrUpdateWorldServerSQL                | [ ]  | P1       | Upsert with ZoneServerGUID conflict |
| GetAbilities                             | [x]  | P1       |                                     |
| GetUserSessionSQL                        | [x]  | P0       |                                     |
| GetUserSessionOnlySQL                    | [ ]  | P1       |                                     |
| GetUserSQL                               | [ ]  | P2       |                                     |
| GetUserFromEmailSQL                      | [ ]  | P2       |                                     |
| GetCharacterByNameSQL                    | [x]  | P0       |                                     |
| GetWorldServerSQL                        | [ ]  | P1       |                                     |
| UpdateNumberOfPlayersSQL                 | [ ]  | P0       | Game server heartbeat               |
| UpdateWorldServerSQL                     | [ ]  | P1       | Set ServerStatus=1                  |
| AddAbilityToCharacter                    | [x]  | P1       |                                     |
| AddCharacterUsingDefaultCharacterValues  | [ ]  | P0       | **Complex CTE**                     |
| RemoveAbilityFromCharacter               | [x]  | P1       |                                     |
| RemoveCharactersFromAllInactiveInstances | [ ]  | P1       | Cleanup                             |
| RemoveCharacterFromInstances             | [ ]  | P1       |                                     |
| UpdateAbilityOnCharacter                 | [x]  | P1       |                                     |
| UpdateUserLastAccess                     | [ ]  | P2       |                                     |
| AddMapInstance                           | [ ]  | P0       | Creates zone instance               |
| GetAllInactiveMapInstances               | [ ]  | P1       | Cleanup                             |
| GetMapInstancesByWorldServerID           | [ ]  | P1       |                                     |
| GetZoneInstancesByZoneAndGroup           | [ ]  | P0       | JoinMapByCharName uses this         |
| RemoveMapInstances (Postgres)            | [ ]  | P1       |                                     |

**Coverage: 7/22 (32%)**

---

### Repository Layer (1,623 lines Postgres)

| Repository                      | Lines | Methods | ROWS Coverage |
| ------------------------------- | ----- | ------- | ------------- |
| UsersRepository.cs              | 498   | 16      | ~60%          |
| CharactersRepository.cs         | 658   | 14      | ~50%          |
| InstanceManagementRepository.cs | 392   | 12      | ~25%          |
| GlobalDataRepository.cs         | 75    | 3       | 100%          |

#### Critical Methods Missing in ROWS:

| Method                                       | Repository   | Why Critical                                            |
| -------------------------------------------- | ------------ | ------------------------------------------------------- |
| `JoinMapByCharName`                          | Characters   | **The big one** — 120 lines, finds/creates MapInstances |
| `SpinUpInstance`                             | Characters   | Creates MapInstance + publishes RabbitMQ                |
| `CheckMapInstanceStatus`                     | Characters   | Polls for zone ready                                    |
| `CreateCharacterUsingDefaultCharacterValues` | Users        | Copies defaults → new character                         |
| `StartWorldServer`                           | InstanceMgmt | Returns WorldServerID after registration                |
| `UpdateNumberOfPlayers`                      | InstanceMgmt | Game server heartbeat                                   |
| `ShutDownWorldServer`                        | InstanceMgmt | Cleanup on shutdown                                     |

---

### Models (49 total)

#### StoredProc Models (15) — Query result shapes:

| Model                          | ROWS | Notes                   |
| ------------------------------ | ---- | ----------------------- |
| CreateCharacter                | [x]  |                         |
| GetAbilityBars                 | [x]  |                         |
| GetAbilityBarsAndAbilities     | [x]  |                         |
| GetAllCharacters               | [x]  | 90+ fields              |
| GetCharByCharName              | [x]  |                         |
| GetCharacterAbilities          | [x]  |                         |
| GetCurrentWorldTime            | [ ]  |                         |
| GetPlayerGroupsCharacterIsIn   | [ ]  |                         |
| GetServerInstanceFromPort      | [ ]  |                         |
| GetUserSession                 | [x]  |                         |
| GetZoneInstancesForWorldServer | [x]  |                         |
| GetZoneInstancesForZone        | [ ]  |                         |
| JoinMapByCharName              | [ ]  | **Complex** — 15 fields |
| PlayerLoginAndCreateSession    | [x]  |                         |
| GetUserSessionComposite        | [ ]  | Parallel query variant  |

#### Table Models (34):

All 37 tables have models. ROWS covers the main ones via `models.rs` (191 lines).
Missing models mostly needed for abilities, chat, player groups — P2/P3.

---

### Middleware & Shared (888 lines)

| Component                   | OWS      | ROWS    | Notes                                          |
| --------------------------- | -------- | ------- | ---------------------------------------------- |
| StoreCustomerGUIDMiddleware | 46 lines | [x]     | Extracts X-CustomerGUID header                 |
| WritableOptions             | 54 lines | N/A     | appsettings.json write (not needed in ROWS)    |
| MQSpinUpServerMessage       | 42 lines | [x]     | RabbitMQ message format                        |
| MQShutDownServerMessage     | 34 lines | [x]     | RabbitMQ message format                        |
| APIPathOptions              | 16 lines | [x]     | Internal service URLs                          |
| RabbitMQOptions             | 14 lines | [x]     | RabbitMQ connection config                     |
| StorageOptions              | 10 lines | [x]     | DB backend selection                           |
| PublicAPIOptions            | 12 lines | [x]     | Timeout config                                 |
| OWSInstanceLauncherOptions  | 30 lines | Partial | PathToDedicatedServer removed, Agones replaces |
| IHeaderCustomerGUID         | 8 lines  | [x]     | Interface for middleware                       |
| ZoneServerProcess           | 20 lines | [x]     | In-memory process tracking                     |

---

### ValKey (Redis) Integration

OWS uses ValKey for session caching (optional). The repository is at:
`OWSData/Repositories/Implementations/ValKey/UserSessionRepository.cs`

| Feature                 | OWS | ROWS | Priority |
| ----------------------- | --- | ---- | -------- |
| Session cache (GET/SET) | Yes | [ ]  | P2       |
| Session expiry          | Yes | [ ]  | P2       |
| Cache-aside pattern     | Yes | [ ]  | P2       |

ROWS currently uses Postgres-only for sessions. ValKey caching is optional but
improves performance for high player counts.

---

## Critical Code Paths for ROWS

### Path 1: Login → Character Select → Play (Game Client)

```
Client                    PublicAPI                    DB
  |-- LoginAndCreateSession -->|-- PlayerLoginAndCreateSession -->|
  |<-- {authenticated, guid} --|<-- session row ------------------|
  |                            |                                  |
  |-- GetAllCharacters ------->|-- GetAllCharacters query ------->|
  |<-- [{char1}, {char2}] ----|<-- character rows ----------------|
  |                            |                                  |
  |-- SetSelectedCharAndGet -->|-- UserSessionSetSelectedChar --->|
  |                            |-- JoinMapByCharName ------------>|
  |                            |   (finds/creates MapInstance)    |
  |                            |-- SpinUpServerInstance --------->| InstanceMgmt
  |                            |   (RabbitMQ → Agones)            |
  |                            |-- poll CheckMapInstanceStatus -->|
  |<-- {serverIP, port} ------|<-- MapInstance ready --------------|
  |                            |                                  |
  |===== UDP ClientTravel =====> game.chuckrpg.com:port          |
```

**ROWS gaps in this path:**

- `SetSelectedCharacterAndGetUserSession` — not implemented
- `JoinMapByCharName` — not implemented (120-line CTE)
- `SpinUpInstance` → RabbitMQ publish — partially implemented
- `CheckMapInstanceStatus` polling loop — not implemented

### Path 2: Game Server Heartbeat (Dedicated Server → API)

```
GameServer                InstanceMgmt              DB
  |-- UpdateNumberOfPlayers -->|-- UpdateSQL -->|
  |<-- success ----------------|<-- updated ----|
  |                            |                |
  | (every 10 seconds)        |                |
  |                            |                |
  | (if empty > MinutesToShutdown)              |
  |-- ShutDown message -------> RabbitMQ        |
```

**ROWS gaps:** `UpdateNumberOfPlayers` not implemented.

### Path 3: Character Persistence (Dedicated Server → API)

```
GameServer            CharPersistence           DB
  |-- GetByName ---------->|-- query -->|
  |<-- full stats ---------|<-- rows ---|
  |                        |            |
  |-- UpdateCharStats ---->|-- update ->|
  |<-- ok -----------------|            |
  |                        |            |
  |-- AddOrUpdateCustom -->|-- upsert ->|
  |<-- ok -----------------|            |
```

**ROWS status:** All character persistence endpoints are implemented.

---

## Known Issues in OWS C# That ROWS Must Avoid

| Issue                     | OWS Behavior                          | ROWS Fix                      |
| ------------------------- | ------------------------------------- | ----------------------------- |
| Npgsql 8.x Search Path    | Silently ignores `Search Path` → 500  | sqlx `options` param          |
| No error logging          | Exceptions swallowed, empty 500       | thiserror + tracing           |
| appsettings.json write    | Crashes on read-only filesystem       | Env vars only                 |
| WorldServer row spam      | New GUID per restart → duplicate rows | Stable env var GUID           |
| ServerStatus never set    | Registers as inactive (0), never → 1  | Set active after registration |
| 5 connection pools        | Each microservice opens its own pool  | Single pool, single binary    |
| pgcrypto in extensions    | Need extensions in search_path        | sqlx handles natively         |
| Process.Start for servers | Doesn't work in containers            | Agones GameServerAllocation   |
| No request correlation    | Can't trace a request across services | Single binary, tracing spans  |
| Serilog HTTP sink noise   | Floods logs with connection errors    | tracing-subscriber only       |

---

## What ROWS Eliminates Entirely

| OWS Component             | Lines  | Why Not Needed                           |
| ------------------------- | ------ | ---------------------------------------- |
| OWSExternalLoginProviders | 622    | Chuck doesn't use Epic/Xsolla            |
| OWSManagement (Vue)       | 401    | Admin panel — build separately if needed |
| MySQL/MSSQL/MongoDB repos | ~3,000 | Postgres only                            |
| WritableOptions           | 54     | No file writes in containers             |
| Multiple Startup.cs       | ~500   | Single main.rs                           |
| SimpleInjector DI         | ~200   | Rust doesn't need DI containers          |
| Docker Compose config     | ~100   | Kubernetes native                        |

**Total eliminated: ~4,877 lines (29% of OWS)**

---

## Summary

| Metric               | OWS C#        | ROWS Rust                 |
| -------------------- | ------------- | ------------------------- |
| Total lines          | 17,025        | 3,284                     |
| Deployable services  | 6             | 1                         |
| Docker images        | 6             | 1                         |
| Connection pools     | 6             | 1                         |
| SQL query files      | 4 (multi-DB)  | 1 (Postgres only)         |
| SQL queries needed   | 74 total      | 33 implemented            |
| Repository methods   | 45            | 24                        |
| REST endpoints       | 48            | 29                        |
| Error handling       | Swallowed     | Structured                |
| Game server spawning | Process.Start | Agones native             |
| Session cache        | ValKey        | Postgres (ValKey planned) |
