# ROWS Endpoint Audit — OWS C# vs ROWS Rust

**Total OWS endpoints: 48** | **ROWS has: 29** | **Missing: 19**

Cross-referenced against: `chuck/OWS/src/` (upstream) + `apps/ows/` (our fork)

## Legend

- `[x]` = Implemented in ROWS
- `[ ]` = Missing from ROWS
- `[~]` = Partially implemented / stubbed

---

## PublicAPI — `/api/Users/*`

The game client's primary interface. All calls go here first.

| Endpoint                                          | ROWS | Priority | Notes                                           |
| ------------------------------------------------- | ---- | -------- | ----------------------------------------------- |
| `POST LoginAndCreateSession`                      | [x]  | P0       | Login with bcrypt verify                        |
| `POST ExternalLoginAndCreateSession`              | [ ]  | P3       | Epic/Xsolla login — not needed for Chuck        |
| `POST RegisterUser`                               | [x]  | P0       | Create account                                  |
| `POST Logout`                                     | [x]  | P1       | End session                                     |
| `GET GetUserSession`                              | [x]  | P0       | Validate session                                |
| `POST GetAllCharacters`                           | [x]  | P0       | Character select screen                         |
| `POST CreateCharacter`                            | [x]  | P0       | Manual character creation                       |
| `POST CreateCharacterUsingDefaultCharacterValues` | [ ]  | P0       | **Used by Chuck** — creates char from defaults  |
| `POST RemoveCharacter`                            | [x]  | P1       | Delete character                                |
| `POST GetPlayerGroupsCharacterIsIn`               | [ ]  | P2       | Party/guild system                              |
| `POST GetServerToConnectTo`                       | [x]  | P0       | **Critical** — zone connection flow             |
| `POST UserSessionSetSelectedCharacter`            | [ ]  | P0       | **Used by Chuck** — sets active char            |
| `POST SetSelectedCharacterAndGetUserSession`      | [ ]  | P0       | **Used by Chuck** — select char + get zone info |

## PublicAPI — `/api/Characters/*`

| Endpoint                    | ROWS | Priority | Notes                                      |
| --------------------------- | ---- | -------- | ------------------------------------------ |
| `POST ByName`               | [x]  | P0       | Get character by name (public variant)     |
| `POST GetDefaultCustomData` | [ ]  | P1       | Default custom data for character creation |

## PublicAPI — `/api/System/*`

| Endpoint     | ROWS | Priority | Notes        |
| ------------ | ---- | -------- | ------------ |
| `GET Status` | [x]  | P0       | Health check |

---

## CharacterPersistence — `/api/Characters/*`

Called by game server (dedicated server) for character data operations.

| Endpoint                        | ROWS | Priority | Notes                             |
| ------------------------------- | ---- | -------- | --------------------------------- |
| `POST GetByName`                | [x]  | P0       | Full character stats              |
| `POST GetCustomData`            | [x]  | P0       | Custom JSON fields                |
| `POST AddOrUpdateCustomData`    | [x]  | P0       | Save custom JSON                  |
| `POST UpdateCharacterStats`     | [x]  | P0       | Bulk stat update from game server |
| `POST UpdateAllPlayerPositions` | [x]  | P1       | Batch position update             |
| `POST PlayerLogout`             | [x]  | P1       | Mark player offline               |

## CharacterPersistence — `/api/Status/*`

| Endpoint                    | ROWS | Priority | Notes                      |
| --------------------------- | ---- | -------- | -------------------------- |
| `POST GetCharacterStatuses` | [ ]  | P2       | Online/offline status list |

## CharacterPersistence — `/api/Abilities/*`

| Endpoint                          | ROWS | Priority | Notes                       |
| --------------------------------- | ---- | -------- | --------------------------- |
| `POST GetAbilities`               | [x]  | P1       | List abilities for customer |
| `POST AddAbilityToCharacter`      | [x]  | P1       | Grant ability               |
| `POST GetCharacterAbilities`      | [x]  | P1       | Character's abilities       |
| `POST GetAbilityBars`             | [x]  | P1       | Action bar layout           |
| `POST GetAbilityBarsAndAbilities` | [x]  | P1       | Combined bars + abilities   |
| `POST RemoveAbilityFromCharacter` | [x]  | P1       | Revoke ability              |
| `POST UpdateAbilityOnCharacter`   | [x]  | P1       | Modify ability level/data   |

---

## InstanceManagement — `/api/Instance/*`

Server lifecycle management. Called by PublicAPI and game servers.

| Endpoint                              | ROWS | Priority | Notes                                     |
| ------------------------------------- | ---- | -------- | ----------------------------------------- |
| `POST RegisterLauncher`               | [x]  | P1       | Launcher registration                     |
| `GET StartInstanceLauncher`           | [x]  | P1       | Get WorldServerID                         |
| `POST ShutDownInstanceLauncher`       | [ ]  | P1       | Launcher shutdown                         |
| `POST SpinUpServerInstance`           | [ ]  | P0       | **Critical** — triggers RabbitMQ → Agones |
| `POST ShutDownServerInstance`         | [ ]  | P1       | Kill a zone server                        |
| `POST SetZoneInstanceStatus`          | [x]  | P0       | Game server reports ready                 |
| `POST GetServerToConnectTo`           | [ ]  | P0       | **Critical** — find/create zone instance  |
| `POST GetZoneInstance`                | [ ]  | P2       | Single instance lookup                    |
| `POST GetServerInstanceFromPort`      | [ ]  | P2       | Lookup by port                            |
| `POST GetZoneInstancesForWorldServer` | [x]  | P1       | List instances for world server           |
| `POST GetZoneInstancesForZone`        | [ ]  | P1       | List instances for zone                   |
| `POST UpdateNumberOfPlayers`          | [ ]  | P0       | **Critical** — game server heartbeat      |
| `GET GetCurrentWorldTime`             | [ ]  | P2       | Server clock sync                         |

## InstanceManagement — `/api/Zones/*`

| Endpoint       | ROWS | Priority | Notes             |
| -------------- | ---- | -------- | ----------------- |
| `POST AddZone` | [x]  | P2       | Create zone in DB |

## InstanceManagement — `/api/System/*`

| Endpoint     | ROWS | Priority | Notes                        |
| ------------ | ---- | -------- | ---------------------------- |
| `GET Status` | [ ]  | P2       | Covered by `/health` in ROWS |

---

## GlobalData — `/api/GlobalData/*`

Key-value store for game-wide settings.

| Endpoint                         | ROWS | Priority | Notes            |
| -------------------------------- | ---- | -------- | ---------------- |
| `POST AddOrUpdateGlobalDataItem` | [x]  | P1       | Set global value |
| `GET GetGlobalDataItem/{key}`    | [x]  | P1       | Get global value |

## GlobalData — `/api/System/*`

| Endpoint     | ROWS | Priority | Notes                        |
| ------------ | ---- | -------- | ---------------------------- |
| `GET Status` | [ ]  | P2       | Covered by `/health` in ROWS |

---

## Management — `/api/Users/*`

Admin panel for managing users. Not called by game client or server.

| Endpoint          | ROWS | Priority | Notes               |
| ----------------- | ---- | -------- | ------------------- |
| `GET /api/Users`  | [ ]  | P3       | List all users      |
| `POST /api/Users` | [ ]  | P3       | Create user (admin) |
| `PUT /api/Users`  | [ ]  | P3       | Edit user (admin)   |

---

## ROWS-only Endpoints (not in OWS C#)

| Endpoint      | Purpose                             |
| ------------- | ----------------------------------- |
| `GET /health` | Kubernetes readiness/liveness probe |
| `GET /ready`  | Kubernetes readiness check          |

---

## Summary by Priority

### P0 — Must have for Chuck to connect (10 missing)

| Missing Endpoint                             | Service      | Why                                          |
| -------------------------------------------- | ------------ | -------------------------------------------- |
| `CreateCharacterUsingDefaultCharacterValues` | PublicAPI    | Chuck uses this, not CreateCharacter         |
| `UserSessionSetSelectedCharacter`            | PublicAPI    | Set active character                         |
| `SetSelectedCharacterAndGetUserSession`      | PublicAPI    | **Client calls this to join zone**           |
| `SpinUpServerInstance`                       | InstanceMgmt | Triggers Agones allocation                   |
| `GetServerToConnectTo` (Instance)            | InstanceMgmt | Finds/creates MapInstance                    |
| `UpdateNumberOfPlayers`                      | InstanceMgmt | Game server heartbeat (keeps instance alive) |

### P1 — Needed for full gameplay (5 missing)

| Missing Endpoint           | Service      | Why                        |
| -------------------------- | ------------ | -------------------------- |
| `GetDefaultCustomData`     | PublicAPI    | Character creation data    |
| `ShutDownInstanceLauncher` | InstanceMgmt | Graceful launcher shutdown |
| `ShutDownServerInstance`   | InstanceMgmt | Zone shutdown              |
| `GetZoneInstancesForZone`  | InstanceMgmt | Zone listing               |

### P2 — Nice to have (5 missing)

| Missing Endpoint               | Service         |
| ------------------------------ | --------------- |
| `GetPlayerGroupsCharacterIsIn` | PublicAPI       |
| `GetCharacterStatuses`         | CharPersistence |
| `GetZoneInstance`              | InstanceMgmt    |
| `GetServerInstanceFromPort`    | InstanceMgmt    |
| `GetCurrentWorldTime`          | InstanceMgmt    |

### P3 — Not needed for Chuck (4 missing)

| Missing Endpoint                | Service    |
| ------------------------------- | ---------- |
| `ExternalLoginAndCreateSession` | PublicAPI  |
| Management CRUD (3 endpoints)   | Management |
