# ROWS Case Audit — Wire Format Compatibility with OWS C# / UE5 Plugin

## Problem

ROWS REST DTOs use `#[serde(rename_all = "PascalCase")]` but the OWS C# API
serializes using ASP.NET Core's default `System.Text.Json` which outputs **camelCase**.
The UE5 OWS Plugin sends camelCase. This causes 422 deserialization errors.

## Root Cause

C# property declarations are PascalCase (`CharacterName`), but ASP.NET Core's
`JsonSerializerDefaults.Web` converts to camelCase on the wire (`characterName`).
ROWS expects PascalCase, receives camelCase → field not found → 422.

## Evidence

UE5 error log:

```
HTTP 422: Failed to deserialize the JSON body into the target type:
missing field `UserSessionGUID` at line 5 column 1
```

Swagger spec shows camelCase:

```json
"GetServerToConnectToRequest": {
  "properties": {
    "characterName": "...",   // camelCase
    "zoneName": "...",        // camelCase
    "playerGroupType": 0      // camelCase
  }
}
```

## Fix Plan

Change all `#[serde(rename_all = "PascalCase")]` to `#[serde(rename_all = "camelCase")]`
on request DTOs, and update individual `#[serde(rename = "...")]` overrides.

---

## Complete Field Audit

### PublicAPI Endpoints

#### `POST /api/Users/LoginAndCreateSession`

| Field    | C# Property | Wire (camelCase) | ROWS Current         | Fix          |
| -------- | ----------- | ---------------- | -------------------- | ------------ |
| email    | Email       | `email`          | `Email` (PascalCase) | → `email`    |
| password | Password    | `password`       | `Password`           | → `password` |

**Response** (`PlayerLoginAndCreateSession`):
| Field | Wire | ROWS Current | Fix |
|-------|------|--------------|-----|
| authenticated | `authenticated` | `authenticated` (camelCase on model) | OK |
| userSessionGuid | `userSessionGuid` | `userSessionGuid` | OK |
| errorMessage | `errorMessage` | `errorMessage` | OK |

#### `POST /api/Users/RegisterUser`

| Field     | Wire        | ROWS Current | Fix           |
| --------- | ----------- | ------------ | ------------- |
| email     | `email`     | `Email`      | → `email`     |
| password  | `password`  | `Password`   | → `password`  |
| firstName | `firstName` | `FirstName`  | → `firstName` |
| lastName  | `lastName`  | `LastName`   | → `lastName`  |

#### `POST /api/Users/Logout`

| Field           | Wire              | ROWS Current      | Fix                 |
| --------------- | ----------------- | ----------------- | ------------------- |
| userSessionGUID | `userSessionGUID` | `UserSessionGUID` | → `userSessionGUID` |

#### `GET /api/Users/GetUserSession`

Query param: `userSessionGUID` — no body, no change needed.

#### `POST /api/Users/GetAllCharacters`

| Field           | Wire              | ROWS Current                 | Fix                          |
| --------------- | ----------------- | ---------------------------- | ---------------------------- |
| userSessionGUID | `userSessionGUID` | `UserSessionGUID` (override) | Keep override OR → camelCase |

#### `POST /api/Users/CreateCharacter`

| Field           | Wire              | ROWS Current      | Fix                 |
| --------------- | ----------------- | ----------------- | ------------------- |
| userSessionGUID | `userSessionGUID` | `UserSessionGUID` | → `userSessionGUID` |
| characterName   | `characterName`   | `CharacterName`   | → `characterName`   |
| className       | `className`       | `ClassName`       | → `className`       |

#### `POST /api/Users/CreateCharacterUsingDefaultCharacterValues`

| Field           | Wire              | ROWS Current      | Fix                 |
| --------------- | ----------------- | ----------------- | ------------------- |
| userSessionGUID | `userSessionGUID` | `UserSessionGUID` | → `userSessionGUID` |
| characterName   | `characterName`   | `CharacterName`   | → `characterName`   |
| defaultSetName  | `defaultSetName`  | `DefaultSetName`  | → `defaultSetName`  |

#### `POST /api/Users/SetSelectedCharacterAndGetUserSession`

| Field           | Wire              | ROWS Current      | Fix                 |
| --------------- | ----------------- | ----------------- | ------------------- |
| userSessionGUID | `userSessionGUID` | `UserSessionGUID` | → `userSessionGUID` |
| characterName   | `characterName`   | `CharacterName`   | → `characterName`   |

#### `POST /api/Users/UserSessionSetSelectedCharacter`

Same as above.

#### `POST /api/Users/RemoveCharacter`

| Field           | Wire              | ROWS Current      | Fix                 |
| --------------- | ----------------- | ----------------- | ------------------- |
| userSessionGUID | `userSessionGUID` | `UserSessionGUID` | → `userSessionGUID` |
| characterName   | `characterName`   | `CharacterName`   | → `characterName`   |

#### `POST /api/Users/GetServerToConnectTo`

| Field           | Wire              | ROWS Current      | Fix                 |
| --------------- | ----------------- | ----------------- | ------------------- |
| userSessionGUID | `userSessionGUID` | `UserSessionGUID` | → `userSessionGUID` |
| characterName   | `characterName`   | `CharacterName`   | → `characterName`   |
| zoneName        | `zoneName`        | `ZoneName`        | → `zoneName`        |

#### `POST /api/Characters/ByName`

| Field           | Wire              | ROWS Current      | Fix                 |
| --------------- | ----------------- | ----------------- | ------------------- |
| userSessionGUID | `userSessionGUID` | `UserSessionGUID` | → `userSessionGUID` |
| characterName   | `characterName`   | `CharacterName`   | → `characterName`   |

#### `POST /api/Characters/GetDefaultCustomData`

| Field          | Wire             | ROWS Current     | Fix                |
| -------------- | ---------------- | ---------------- | ------------------ |
| defaultSetName | `defaultSetName` | `DefaultSetName` | → `defaultSetName` |

---

### InstanceManagement Endpoints

#### `POST /api/Instance/SetZoneInstanceStatus`

| Field          | Wire             | ROWS Current                | Fix                |
| -------------- | ---------------- | --------------------------- | ------------------ |
| (wrapper)      | `request`        | `request`                   | OK                 |
| zoneInstanceID | `zoneInstanceID` | `ZoneInstanceID` (override) | → `zoneInstanceID` |
| instanceStatus | `instanceStatus` | `InstanceStatus`            | → `instanceStatus` |

#### `POST /api/Instance/GetZoneInstancesForWorldServer`

| Field         | Wire            | ROWS Current               | Fix               |
| ------------- | --------------- | -------------------------- | ----------------- |
| (wrapper)     | `request`       | `request`                  | OK                |
| worldServerID | `worldServerID` | `WorldServerID` (override) | → `worldServerID` |

#### `POST /api/Instance/UpdateNumberOfPlayers`

| Field                    | Wire                       | ROWS Current                | Fix                          |
| ------------------------ | -------------------------- | --------------------------- | ---------------------------- |
| zoneInstanceId           | `zoneInstanceId`           | `ZoneInstanceID` (override) | → `zoneInstanceId`           |
| numberOfConnectedPlayers | `numberOfConnectedPlayers` | `NumberOfPlayers`           | → `numberOfConnectedPlayers` |

**Note:** swagger says `numberOfConnectedPlayers`, not `numberOfPlayers`.

#### `POST /api/Instance/RegisterLauncher`

| Field                | Wire                   | ROWS Current            | Fix                      |
| -------------------- | ---------------------- | ----------------------- | ------------------------ |
| (wrapper)            | `request`              | `Request` (PascalCase!) | → `request`              |
| launcherGUID         | `launcherGUID`         | `launcherGUID`          | OK                       |
| serverIP             | `serverIP`             | `ServerIP`              | → `serverIP`             |
| maxNumberOfInstances | `maxNumberOfInstances` | `MaxNumberOfInstances`  | → `maxNumberOfInstances` |
| internalServerIP     | `internalServerIP`     | `InternalServerIP`      | → `internalServerIP`     |
| startingInstancePort | `startingInstancePort` | `StartingInstancePort`  | → `startingInstancePort` |

#### `POST /api/Instance/SpinUpServerInstance`

| Field          | Wire             | ROWS Current                | Fix                |
| -------------- | ---------------- | --------------------------- | ------------------ |
| worldServerID  | `worldServerID`  | `WorldServerID` (override)  | → `worldServerID`  |
| zoneInstanceID | `zoneInstanceID` | `ZoneInstanceID` (override) | → `zoneInstanceID` |
| zoneName       | `zoneName`       | `ZoneName`                  | → `zoneName`       |
| port           | `port`           | `Port`                      | → `port`           |

#### `POST /api/Instance/ShutDownServerInstance`

| Field          | Wire             | ROWS Current                | Fix                |
| -------------- | ---------------- | --------------------------- | ------------------ |
| worldServerID  | `worldServerID`  | `WorldServerID` (override)  | → `worldServerID`  |
| zoneInstanceID | `zoneInstanceID` | `ZoneInstanceID` (override) | → `zoneInstanceID` |

#### `POST /api/Instance/GetServerToConnectTo` (Instance variant)

Same as PublicAPI variant.

#### `POST /api/Instance/GetZoneInstancesForZone`

| Field   | Wire      | ROWS Current | Fix         |
| ------- | --------- | ------------ | ----------- |
| mapName | `mapName` | `MapName`    | → `mapName` |

#### `POST /api/Instance/GetCurrentWorldTime`

| Field         | Wire            | ROWS Current               | Fix               |
| ------------- | --------------- | -------------------------- | ----------------- |
| (wrapper)     | `request`       | `request`                  | OK                |
| worldServerID | `worldServerID` | `WorldServerID` (override) | → `worldServerID` |

---

### CharacterPersistence Endpoints

#### `POST /api/Characters/GetByName`

| Field         | Wire            | ROWS Current    | Fix               |
| ------------- | --------------- | --------------- | ----------------- |
| characterName | `characterName` | `CharacterName` | → `characterName` |

#### `POST /api/Characters/GetCustomData`

Same as GetByName.

#### `POST /api/Characters/AddOrUpdateCustomData`

| Field                    | Wire                       | ROWS Current               | Fix                          |
| ------------------------ | -------------------------- | -------------------------- | ---------------------------- |
| characterName            | `characterName`            | `CharacterName`            | → `characterName`            |
| customCharacterDataKey   | `customCharacterDataKey`   | `CustomCharacterDataKey`   | → `customCharacterDataKey`   |
| customCharacterDataValue | `customCharacterDataValue` | `CustomCharacterDataValue` | → `customCharacterDataValue` |

#### `POST /api/Characters/UpdateCharacterStats`

| Field         | Wire            | ROWS Current        | Fix               |
| ------------- | --------------- | ------------------- | ----------------- |
| characterName | `characterName` | `CharacterName`     | → `characterName` |
| (stats)       | camelCase       | `#[serde(flatten)]` | OK (dynamic)      |

#### `POST /api/Characters/UpdateAllPlayerPositions`

| Field                        | Wire                           | ROWS Current                   | Fix                              |
| ---------------------------- | ------------------------------ | ------------------------------ | -------------------------------- |
| serializedPlayerLocationData | `serializedPlayerLocationData` | `SerializedPlayerLocationData` | → `serializedPlayerLocationData` |
| mapName                      | `mapName`                      | `MapName`                      | → `mapName`                      |

#### `POST /api/Characters/PlayerLogout`

| Field         | Wire            | ROWS Current    | Fix               |
| ------------- | --------------- | --------------- | ----------------- |
| characterName | `characterName` | `CharacterName` | → `characterName` |

---

### Abilities Endpoints

All use `characterName` (camelCase) — currently `CharacterName` (PascalCase).

#### `POST /api/Abilities/AddAbilityToCharacter`

| Field         | Wire            | ROWS Current    | Fix               |
| ------------- | --------------- | --------------- | ----------------- |
| characterName | `characterName` | `CharacterName` | → `characterName` |
| abilityName   | `abilityName`   | `AbilityName`   | → `abilityName`   |
| abilityLevel  | `abilityLevel`  | `AbilityLevel`  | → `abilityLevel`  |

---

### GlobalData Endpoints

#### `POST /api/GlobalData/AddOrUpdateGlobalDataItem`

| Field           | Wire              | ROWS Current      | Fix                 |
| --------------- | ----------------- | ----------------- | ------------------- |
| globalDataKey   | `globalDataKey`   | `GlobalDataKey`   | → `globalDataKey`   |
| globalDataValue | `globalDataValue` | `GlobalDataValue` | → `globalDataValue` |

---

### Response Models

Response models in `models.rs` already use `#[serde(rename_all = "camelCase")]` — these are correct.

Only request DTOs in `rest.rs` need fixing.

---

## Summary

- **28 DTOs** in rest.rs use `PascalCase` — all need `camelCase`
- **8 field overrides** (`#[serde(rename = "...")]`) — some correct, some wrong
- **Response models** — already correct (camelCase)
- **Wrapper structs** (`request` field) — mostly correct except `RegisterLauncherWrapper` uses `Request` instead of `request`
- **`UpdateNumberOfPlayers`** — field name mismatch: ROWS uses `numberOfPlayers`, swagger says `numberOfConnectedPlayers`

## Action

1. Change all `#[serde(rename_all = "PascalCase")]` → `#[serde(rename_all = "camelCase")]` on request DTOs
2. Remove `#[serde(rename = "...")]` overrides that are no longer needed (camelCase handles them)
3. Keep `#[serde(rename = "...")]` only for non-standard casing (e.g., `userSessionGUID` with trailing caps)
4. Fix `RegisterLauncherWrapper` `Request` → `request`
5. Fix `UpdateNumberOfPlayers` field name: `numberOfPlayers` → `numberOfConnectedPlayers`
