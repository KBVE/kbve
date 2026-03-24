# GetPlayerGroupsCharacterIsIn

## Status: Not Implemented in ROWS

This is the only OWS PublicAPI endpoint not yet implemented in ROWS.

## Endpoint

```
POST /api/Users/GetPlayerGroupsCharacterIsIn
```

**Auth**: `X-CustomerGUID` header (UUID)

## Description

Gets a list of Player Groups that a Character belongs to. Player Groups are persistent across sessions and represent Party groups, Raid groups, Guilds, etc.

Set `playerGroupTypeID` to `0` to return all group types (removes the type filter).

See the `PlayerGroupTypes` table for available group types.

## Request Body

```json
{
	"userSessionGUID": "uuid",
	"characterName": "string",
	"playerGroupTypeID": 0
}
```

| Field               | Type   | Required | Description                    |
| ------------------- | ------ | -------- | ------------------------------ |
| `userSessionGUID`   | UUID   | Yes      | Active user session            |
| `characterName`     | string | Yes      | Character to look up           |
| `playerGroupTypeID` | int32  | Yes      | Filter by group type (0 = all) |

## Response (200 OK)

Returns an array of player groups:

```json
[
	{
		"playerGroupID": 1,
		"customerGUID": "uuid",
		"playerGroupName": "My Guild",
		"playerGroupTypeID": 3,
		"readyState": 0,
		"createDate": "2026-01-01T00:00:00Z"
	}
]
```

| Field               | Type     | Description                           |
| ------------------- | -------- | ------------------------------------- |
| `playerGroupID`     | int32    | Unique group identifier               |
| `customerGUID`      | UUID     | Customer/tenant GUID                  |
| `playerGroupName`   | string   | Display name of the group             |
| `playerGroupTypeID` | int32    | Group type (party, raid, guild, etc.) |
| `readyState`        | int32    | Ready state for the group             |
| `createDate`        | datetime | When the group was created            |

## SQL Query (PostgreSQL)

```sql
SELECT PG.PlayerGroupID,
       PG.CustomerGUID,
       PG.PlayerGroupName,
       PG.PlayerGroupTypeID,
       PG.ReadyState,
       PG.CreateDate,
       PGC.DateAdded,
       PGC.TeamNumber
FROM PlayerGroupCharacters PGC
INNER JOIN PlayerGroup PG
    ON PG.PlayerGroupID = PGC.PlayerGroupID
    AND PG.CustomerGUID = PGC.CustomerGUID
INNER JOIN Characters C
    ON C.CharacterID = PGC.CharacterID
INNER JOIN UserSessions US
    ON US.UserGUID = C.UserGUID
    AND US.CustomerGUID = C.CustomerGUID
WHERE PGC.CustomerGUID = @CustomerGUID
  AND (PG.PlayerGroupTypeID = @PlayerGroupTypeID OR @PlayerGroupTypeID = 0)
  AND C.CharName = @CharName
  AND C.CustomerGUID = @CustomerGUID
```

## Tables Involved

- `PlayerGroupCharacters` — join table: character ↔ group membership
- `PlayerGroup` — group definitions (name, type, ready state)
- `Characters` — character lookup by name
- `UserSessions` — session validation
- `PlayerGroupTypes` — reference table for group type IDs

## Implementation Notes

- The query joins through `UserSessions` to validate the session but does NOT filter by `userSessionGUID` — it only uses `CharName` and `CustomerGUID` for the actual lookup. The `userSessionGUID` is validated upstream by the middleware.
- `@PlayerGroupTypeID = 0` acts as a wildcard filter (returns all types).
- The response also includes `DateAdded` and `TeamNumber` from `PlayerGroupCharacters` which are not in the swagger schema but are returned by the SQL.
