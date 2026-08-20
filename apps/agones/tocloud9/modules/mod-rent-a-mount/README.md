# mod-rent-a-mount

Rentable mounts for the ToCloud9 worldserver. A player talks to a rental NPC,
pays a small fee, and gets a mount aura with a finite duration. The rental ends
when the timer runs out or the player dismounts, dies, or logs out.

**Scaffold only — not wired into any build yet.** Nothing clones this into
`/repo/modules`, no SQL has been applied to any database, and the gameserver
image does not know it exists. Integration is a separate step.

## Why this exists rather than the upstream module

`dannydefeato/mod-rent-a-mount` does the same job, but its SQL writes
`creature`.`id`. Both of our lanes are still on the pre-collapse schema:

| Lane                                                          | `creature` columns  |
| ------------------------------------------------------------- | ------------------- |
| cluster (`ghcr.io/walkline/*:master`, `db-import:16.0.0-dev`) | `id1`, `id2`, `id3` |
| playerbots (`3kynox/azerothcore-wotlk@35a34b6`, 2026-07-28)   | `id1`, `id2`, `id3` |

Verified against the live cluster world database and against the pinned fork's
`data/sql/base/db_world/creature.sql`. Every upstream migration would fail on
`Unknown column 'id'` — roughly 68 references across 11 migrations plus 120 in
`extras/uninstall.sql`. Porting that is more churn than writing a smaller module
against the schema we actually run, so this targets `id1` directly.

The upstream project is a useful reference for behaviour and for its
`LOCATIONS.md` coordinate work, and it is GPL-2.0 like everything else in this
stack.

## Reserved ranges

Verified unused on the live world database before being chosen, and kept clear
of upstream's 900100-900199 so both modules could coexist:

| Range                                   | Use               |
| --------------------------------------- | ----------------- |
| `creature_template.entry` 900300-900399 | rental NPCs       |
| `creature.guid` 9003000-9003199         | rental NPC spawns |
| `npc_text.ID` 90030-90039               | gossip text       |

## Layout

| Path                              | Contents                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `src/MP_loader.cpp`               | `Addmod_rent_a_mountScripts()`, the entry point AzerothCore generates a call to |
| `src/rent_a_mount.cpp`            | gossip NPC script, offer store, aura duration handling                          |
| `conf/mod_rent_a_mount.conf.dist` | `RentAMount.*` options                                                          |
| `data/sql/db-world/base/`         | ordered world migrations                                                        |

## Offers live in the database

Mount aura spell IDs come from the client's `Spell.dbc` and cannot be verified
from the world database, so they are not hardcoded. `mod_rent_a_mount_offers`
holds the spell, price, duration, and label per team, which means a wrong spell
ID is a SQL fix rather than a rebuild.

The seeded rows use 458 (horse) and 580 (wolf). **Both are unverified** — check
them in-game before trusting them.

`team` is `0` Alliance, `1` Horde, `2` either. A zero `price_copper` or
`duration_seconds` falls back to the config default.

## Playerbots dependency

`SessionAllowed()` calls `WorldSession::IsBot()`, which only exists on the
mod-playerbots fork. Building against stock AzerothCore needs that call removed.
`RentAMount.AllowBots = 1` skips the check at runtime but does not remove the
compile-time dependency.

## Verified

Both checks were run against the same pinned refs the playerbots image builds
from, not against assumptions:

**It compiles.** `3kynox/azerothcore-wotlk@35a34b6` plus
`3kynox/mod-playerbots@d9c80b3` were checked out in a container, this module was
copied into `modules/`, and cmake was configured with `-DMODULES=static`. Both
translation units appear in `compile_commands.json` — which also confirms
AzerothCore auto-discovers this layout — and both pass `-fsyntax-only` with no
errors and no warnings. That exercises the includes, the gossip API, the
`Field::Get<>` calls, `Aura::SetDuration`/`SetMaxDuration`, `TeamId`, and the
`Addmod_rent_a_mountScripts` symbol name.

**The seeded spell IDs are right.** Read out of the client's own `Spell.dbc` on
the RWX client-data volume — 49,839 records, 234 fields, name at field 136:

| Spell | Name        |
| ----- | ----------- |
| 458   | Brown Horse |
| 580   | Timber Wolf |

Nearby alternates, should more offers be wanted: 472 Pinto, 6648 Chestnut Mare,
6777 Gray Ram, 6653 Dire Wolf.

## Still open

- No cleanup hook for teleport. Upstream added one specifically
  (`Prevent rental mount restoration after teleports`), so this needs the same
  treatment before it is trusted in a real world.
- No uninstall script.
- Compiling is not the same as running: no rental has been performed in-game, so
  the gossip flow, the money charge, and the aura duration are still untested at
  runtime.
- Four spawns (Stormwind, Ironforge, Orgrimmar, Undercity), positioned from
  stable master coordinates already in the live database.

## License

GPL-2.0-or-later, matching AzerothCore, mod-playerbots, and the upstream module.
