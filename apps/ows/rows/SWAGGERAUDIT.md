# ROWS vs OWS Swagger Audit

Audit date: 2026-03-24
Source: `apps/ows/rows-e2e/json/*.json` (4 OWS swagger files)
Target: `apps/ows/rows/src/rest.rs` (ROWS route definitions)

## Summary

| Service              | OWS Endpoints | ROWS Routes | Coverage |
| -------------------- | ------------- | ----------- | -------- |
| PublicAPI            | 16            | 15          | 94%      |
| InstanceManagement   | 15            | 15          | 100%     |
| CharacterPersistence | 15            | 15          | 100%     |
| GlobalData           | 3             | 3           | 100%     |
| **Total**            | **49**        | **48**      | **98%**  |

---

## PublicAPI (swagger.json from dist/) — 15/16

| OWS Endpoint                                            | Method | ROWS Handler                     | Status            |
| ------------------------------------------------------- | ------ | -------------------------------- | ----------------- |
| `/api/Users/LoginAndCreateSession`                      | POST   | `login`                          | OK                |
| `/api/Users/ExternalLoginAndCreateSession`              | POST   | `external_login`                 | OK                |
| `/api/Users/RegisterUser`                               | POST   | `register_user`                  | OK                |
| `/api/Users/Logout`                                     | POST   | `logout`                         | OK                |
| `/api/Users/GetUserSession`                             | GET    | `get_user_session`               | OK                |
| `/api/Users/GetAllCharacters`                           | POST   | `get_all_characters`             | OK                |
| `/api/Users/CreateCharacter`                            | POST   | `create_character`               | OK                |
| `/api/Users/CreateCharacterUsingDefaultCharacterValues` | POST   | `create_char_defaults`           | OK                |
| `/api/Users/SetSelectedCharacterAndGetUserSession`      | POST   | `set_selected_char`              | OK                |
| `/api/Users/UserSessionSetSelectedCharacter`            | POST   | `user_session_set_selected_char` | OK                |
| `/api/Users/RemoveCharacter`                            | POST   | `remove_character`               | OK                |
| `/api/Users/GetServerToConnectTo`                       | POST   | `get_server_to_connect_to`       | OK                |
| `/api/Users/GetPlayerGroupsCharacterIsIn`               | POST   | —                                | **MISSING ROUTE** |
| `/api/Characters/ByName`                                | POST   | `get_char_by_name_public`        | OK                |
| `/api/Characters/GetDefaultCustomData`                  | POST   | `get_default_custom_data`        | OK                |
| `/api/System/Status`                                    | GET    | `system_status`                  | OK                |

### GetPlayerGroupsCharacterIsIn — Details

Repo function exists at `repo.rs:247` (`UsersRepo::get_player_groups_character_is_in`) but is not wired to a route. Additionally, the repo implementation has gaps:

| Issue           | OWS                              | ROWS                                  |
| --------------- | -------------------------------- | ------------------------------------- |
| Wildcard filter | `OR @PlayerGroupTypeID = 0`      | Missing — no wildcard when type=0     |
| Return type     | Full struct (8 fields)           | Tuple `(i32, String, i32)` — 3 fields |
| Table name      | `PlayerGroupCharacters` (plural) | `playergroupcharacter` (singular)     |
| Session join    | Joins `UserSessions`             | No session validation                 |

---

## InstanceManagement (instance_swagger.json) — 15/15

| OWS Endpoint                                   | Method | ROWS Handler                        | Status |
| ---------------------------------------------- | ------ | ----------------------------------- | ------ |
| `/api/Instance/SetZoneInstanceStatus`          | POST   | `set_zone_status`                   | OK     |
| `/api/Instance/ShutDownServerInstance`         | POST   | `shut_down_server_instance`         | OK     |
| `/api/Instance/RegisterLauncher`               | POST   | `register_launcher`                 | OK     |
| `/api/Instance/SpinUpServerInstance`           | POST   | `spin_up_server_instance`           | OK     |
| `/api/Instance/StartInstanceLauncher`          | GET    | `start_instance_launcher`           | OK     |
| `/api/Instance/ShutDownInstanceLauncher`       | POST   | `shut_down_instance_launcher`       | OK     |
| `/api/Instance/GetServerToConnectTo`           | POST   | `instance_get_server_to_connect_to` | OK     |
| `/api/Instance/GetZoneInstance`                | POST   | `get_zone_instance`                 | OK     |
| `/api/Instance/GetServerInstanceFromPort`      | POST   | `get_server_instance_from_port`     | OK     |
| `/api/Instance/GetZoneInstancesForWorldServer` | POST   | `get_zone_instances`                | OK     |
| `/api/Instance/UpdateNumberOfPlayers`          | POST   | `update_number_of_players`          | OK     |
| `/api/Instance/GetZoneInstancesForZone`        | POST   | `get_zone_instances_for_zone`       | OK     |
| `/api/Instance/GetCurrentWorldTime`            | POST   | `get_current_world_time`            | OK     |
| `/api/System/Status`                           | GET    | `system_status`                     | OK     |
| `/api/Zones/AddZone`                           | POST   | `add_zone`                          | OK     |

---

## CharacterPersistence (character_swagger.json) — 15/15

| OWS Endpoint                                | Method | ROWS Handler                     | Status |
| ------------------------------------------- | ------ | -------------------------------- | ------ |
| `/api/Abilities/AddAbilityToCharacter`      | POST   | `add_ability`                    | OK     |
| `/api/Abilities/GetCharacterAbilities`      | POST   | `get_character_abilities`        | OK     |
| `/api/Abilities/GetAbilities`               | GET    | `get_abilities_list`             | OK     |
| `/api/Abilities/GetAbilityBars`             | POST   | `get_ability_bars`               | OK     |
| `/api/Abilities/GetAbilityBarsAndAbilities` | POST   | `get_ability_bars_and_abilities` | OK     |
| `/api/Abilities/RemoveAbilityFromCharacter` | POST   | `remove_ability`                 | OK     |
| `/api/Abilities/UpdateAbilityOnCharacter`   | POST   | `update_ability`                 | OK     |
| `/api/Characters/AddOrUpdateCustomData`     | POST   | `add_or_update_custom_data`      | OK     |
| `/api/Characters/GetByName`                 | POST   | `get_char_by_name`               | OK     |
| `/api/Characters/GetCustomData`             | POST   | `get_custom_data`                | OK     |
| `/api/Characters/UpdateAllPlayerPositions`  | POST   | `update_all_positions`           | OK     |
| `/api/Characters/UpdateCharacterStats`      | POST   | `update_character_stats`         | OK     |
| `/api/Characters/PlayerLogout`              | POST   | `player_logout`                  | OK     |
| `/api/Status/GetCharacterStatuses`          | POST   | `get_character_statuses`         | OK     |
| `/api/System/Status`                        | GET    | `system_status`                  | OK     |

---

## GlobalData (global_swagger.json) — 3/3

| OWS Endpoint                                        | Method | ROWS Handler      | Status |
| --------------------------------------------------- | ------ | ----------------- | ------ |
| `/api/GlobalData/AddOrUpdateGlobalDataItem`         | POST   | `set_global_data` | OK     |
| `/api/GlobalData/GetGlobalDataItem/{globalDataKey}` | GET    | `get_global_data` | OK     |
| `/api/System/Status`                                | GET    | `system_status`   | OK     |

---

## Next Steps

1. Wire `GetPlayerGroupsCharacterIsIn` route in `rest.rs`
2. Fix repo SQL (wildcard filter, return struct, table name, session join)
3. Deep audit handler implementations (request/response schema parity with swagger DTOs)
4. Verify error response formats match OWS behavior
