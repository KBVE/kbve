# mod-dragon-wars

A Booty Bay squadron event. Talk to Sizzik Vaneblast with a full group, and every member gets their own Wintergrasp Fighter Plane.

## What it does

Sizzik Vaneblast (`900400`) stands on the Booty Bay main deck. His single gossip option launches a sortie:

1. Checks the talker has a group of exactly `DragonWars.SquadronSize` (default 5).
2. Checks every member is on the same map, within `DragonWars.MaxRange`, alive, out of combat, and not already in a vehicle, mounted, on a taxi, teleporting, or shapeshifted.
3. Summons one plane per member at that member's own position.
4. Seats each member in their plane.
5. Writes one row per pilot to `mod_dragon_wars_sorties`.

The planes are `TEMPSUMMON_TIMED_DESPAWN` for `DragonWars.DurationSeconds` (default 900), so the sortie cleans itself up. There is no despawn hook to get wrong.

## Why it seats pilots directly

Bots are seated with `Player::EnterVehicle`, not by asking their AI to board. mod-playerbots only triggers `EnterVehicleAction` from `BattlegroundStrategy` and from chat commands, so a bot standing in Booty Bay would never choose to climb in. Seating them from the module sidesteps bot AI entirely and works the same for players and bots.

Once seated, bots fly and fight on their own — but **only on mod-playerbots `7dc97ba` or newer**. Before that, every vehicle-weapon trigger lived in `IsleStrategy`, gated on `bgType == BATTLEGROUND_IC` and naming each Isle of Conquest weapon by hand, so a bot in a plane outside a battleground boarded and then never fired. `CastVehicleAttackAction` reads the ridden creature's own `m_spells[]` bar instead.

Seat 0 of vehicle kit 8 carries `VEHICLE_SEAT_FLAG_CAN_CAST`, which is what gates vehicle spells. It does not carry `CAN_ATTACK`, but that only blocks the bot's own class abilities from the cockpit — the plane's guns are unaffected.

## Traps

**`creature`.`id`, not `id1`.** This core still ships the single-`id` schema. Writing `id1` fails the file _after_ earlier statements have committed, leaving the module half-installed and every db-import retry failing.

**Two databases.** `UpdateFetcher` walks every subdirectory of `modules/<name>/data/sql/` and matches the directory name against the database's module name — `db-world` matches `world`, `db-characters` matches `characters`. The NPC goes to world; the sortie log is per-character state and goes to characters. Renaming either directory silently stops it being applied.

**Cast-time weapons will not fire from a plane.** `PlayerbotAI::CanCastVehicleSpell` returns false for any spell with a cast time while the vehicle is moving, and a plane is always moving. Keep the action bar instant.

**SQL is applied by db-import only.** Like mod-rent-a-mount, the world SQL is deliberately absent from the gameserver stage — that fleet can surge to two pods and `DBUpdater` carries no lock, so a worldserver able to see this SQL could race another applying it.

## Config

| Key                          | Default | Meaning                                      |
| ---------------------------- | ------- | -------------------------------------------- |
| `DragonWars.Enable`          | `1`     | Master switch                                |
| `DragonWars.SquadronSize`    | `5`     | Exact group size required                    |
| `DragonWars.PlaneEntry`      | `27838` | Wintergrasp Fighter Plane                    |
| `DragonWars.DurationSeconds` | `900`   | Sortie length before the planes despawn      |
| `DragonWars.MaxRange`        | `40`    | How far a pilot may stand from Sizzik        |
| `DragonWars.LeaderOnly`      | `1`     | Only the group leader can launch             |
| `DragonWars.AllowBots`       | `1`     | Bots are the point here, so this defaults on |

## Uninstall

`extras/uninstall.sql` against `acore_world`, `extras/uninstall_characters.sql` against `acore_characters`. The planes are temporary summons and leave nothing behind.

## IDs used

| Thing                       | ID        |
| --------------------------- | --------- |
| `creature_template`.`entry` | `900400`  |
| `creature`.`guid`           | `9004000` |
| `npc_text`.`ID`             | `90040`   |
