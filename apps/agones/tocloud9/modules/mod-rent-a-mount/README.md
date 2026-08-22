# mod-rent-a-mount

Rentable mounts for the ToCloud9 worldserver. A player talks to a rental NPC,
pays a small fee, and gets a mount aura with a finite duration. The rental ends
when the timer runs out or the player dismounts or dies.

Rentals survive logout on purpose. The core saves auras with their remaining
duration and does not dismount on the way out, so paid time carries into the
next session instead of being lost.

Wired into the gameserver build. `mod-rent-a-mount` arrives through the
`modules` build context, so the C++ compiles into the worldserver, the conf
lands in `etc/modules/`, and the world SQL ships only in the `db-import` image.

**Never run in-game.** Nothing here has executed against a live worldserver:
the gossip flow, the money charge, and the aura duration are untested.

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
| `data/sql/db-world/base/`         | first-install schema and seed data                                              |
| `data/sql/db-world/updates/`      | every schema change made after the first deploy                                 |
| `extras/`                         | manual uninstall scripts, one per database                                      |

## How this SQL actually gets applied

Worth writing down, because the mechanics are not what the directory names
suggest. Read out of `UpdateFetcher.cpp` rather than assumed:

`ReceiveIncludedDirectories()` registers `modules/<name>/data/sql/db-world` as
one directory with state `MODULE`, then `FillFileListRecursively()` walks it to
a depth of 10. So `base/` and `updates/` are collected identically and both are
tracked by sha1 in the `updates` table. The split is a convention for humans,
not a mechanism.

Three rules follow from that, and all three bite:

**A changed file is re-applied.** The fetcher compares the file's sha1 against
the stored hash and reruns it when they differ. Every file here has to stay safe
to run twice, which is why they lead with `DELETE` before `INSERT`.

**Never edit a shipped file to change the schema.** `00_..._schema.sql` opens
with `CREATE TABLE IF NOT EXISTS`. Adding a column to it does change the hash
and does trigger a re-apply, but `IF NOT EXISTS` then short-circuits and the
column never appears. The change has to be a new file in `updates/` carrying an
`ALTER TABLE`. This is the one that looks like it worked and did not.

**Filenames are globally unique across every loaded module.** Ordering is by
filename alone and a collision is `LOG_FATAL`, taking the worldserver down at
startup. Hence the `mod_rent_a_mount` infix on every file — checked clear
against `mod-underbarrel-bootlegger`, the only other module in the tree.

## Where the SQL must live at integration time

Module SQL is applied by whichever binary can see it on disk. The Dockerfile
copies `mod-playerbots/data/sql` into the `gameserver` stage because the
worldserver itself creates and migrates `acore_playerbots`.

**Do not do that for this module.** Its SQL belongs in the `db-import` stage
only.

The worldserver fleet runs `replicas: 2`, `Updates.EnableDatabases` is unset so
it defaults to `7`, and `DBUpdater.cpp` has no `GET_LOCK` or table lock of any
kind — it is written for a single worldserver. Two pods that can both see this
module's SQL would both apply it, concurrently, on cold start.

That race is not live today. Verified from a running worldserver:

```
DBUpdater: Given update include directory "/repo/data/sql/updates/db_auth" does not exist, skipped!
>> The file '2026_07_19_00.sql' was applied to the database, but is missing in your update directory now!
```

The `gameserver` stage never copies `/repo/data/sql`, so the updater finds
nothing to apply and only warns about dead references. Copying this module's
`data/sql` into that stage is precisely what would arm it.

Keeping the SQL in `db-import` leaves a single writer: the Job is an ArgoCD Sync
hook in wave 1, ahead of the fleet in wave 2.

## Offers live in the database

Mount aura spell IDs come from the client's `Spell.dbc` and cannot be verified
from the world database, so they are not hardcoded. `mod_rent_a_mount_offers`
holds the spell, price, duration, and label per team, which means a wrong spell
ID is a SQL fix rather than a rebuild.

The seeded rows use 458 (horse) and 580 (wolf), both read out of the client's
own `Spell.dbc` — see Verified below.

`team` is `0` Alliance, `1` Horde, `2` either. A zero `price_copper` or
`duration_seconds` falls back to the config default.

## Pricing and eligibility

Both seeded offers are **50 copper for 900 seconds**. That is deliberately cheap
because renting is a convenience, not a shortcut — the renter is someone who
could already mount and simply has not bought one.

That only holds if the gates are enforced, so they are. `min_level` and
`min_riding_skill` on each offer default the seed rows to **level 20 and Riding
75**, which is what the stock mounts themselves require:

| Item                           | RequiredLevel | RequiredSkill | Rank |
| ------------------------------ | ------------- | ------------- | ---- |
| Brown Horse Bridle (5656)      | 20            | 762 Riding    | 75   |
| Horn of the Timber Wolf (1132) | 20            | 762 Riding    | 75   |

Without them the price would be a problem rather than a bargain: those items
cost 10,000 copper (1 gold) to own permanently, so an ungated 50 copper rental
is 1/200th the price of the real thing, and a level 1 with no Riding skill could
ride one. `Player::CastSpell` is called triggered, which skips the engine's own
skill and level checks, so nothing else would stop it.

Set either column to `0` to disable that check for an offer. Both are database
columns rather than config so they can be relaxed per offer without a rebuild.

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

## Uninstall

Two scripts under `extras/`, because they target different databases. Stop the
worldserver before either — a running worldserver holds auras in memory and
rewrites them on save.

Run them in this order:

1. `uninstall_characters.sql` against `acore_characters`, while the world
   database still holds the spell IDs it needs.
2. `uninstall.sql` against `acore_world`.

Every statement is scoped to an ID range this module owns, so neither script can
touch stock data. That is the one real advantage of never having modified a
stock row: upstream replaces the Crossroads wolf, and its uninstall is 135 KB of
guarded stored procedures rolling migrations back stage by stage. This is two
short files.

The characters script keys on `maxDuration > 0` to tell a rental apart from a
mount the player owns. Without that it would also dismount anyone who logged out
riding a mount they bought.

## Still open

- No cleanup hook for teleport. Upstream added one specifically
  (`Prevent rental mount restoration after teleports`), and their comment says
  delayed return-teleport processing can otherwise recreate the mount spell with
  an indefinite duration. That needs an in-game repro before it is worth code.
- Compiling is not the same as running: no rental has been performed in-game, so
  the gossip flow, the money charge, and the aura duration are still untested at
  runtime.
- Four spawns (Stormwind, Ironforge, Orgrimmar, Undercity), positioned from
  stable master coordinates already in the live database.

## License

GPL-2.0-or-later, matching AzerothCore, mod-playerbots, and the upstream module.
