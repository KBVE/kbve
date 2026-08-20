# Fizzik Underbarrel — operating the module

Everything in this directory is ours. The rest of the module is vendored
upstream and is not edited; see `../VENDOR.md`.

| file                        | purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `mod_bootlegger.conf`       | our option values, deployed over the module's conf            |
| `sql/01_npc.sql`            | defines Fizzik — gossip text, template, model. Spawns nothing |
| `sql/02_spawn_one.sql`      | places one Fizzik. Edit six values at the top                 |
| `sql/03_spawn_capitals.sql` | places all ten capitals at upstream's unverified coordinates  |
| `sql/99_remove_spawns.sql`  | removes every spawn, keeps the template                       |

Upstream ships one install file that defines the NPC _and_ drops ten spawns.
Splitting the two is what makes placement a decision rather than a side effect:
`01` can be applied on every deploy, and where he actually stands is chosen
separately.

There is a second reason these are copies rather than a pointer at upstream's
file: **upstream's install SQL does not run on this core.** It inserts into
`creature`.`id`, and our worldserver's schema has `id1`/`id2`/`id3` instead:

```
ERROR 1054 (42S22): Unknown column 'id' in 'field list'
```

The files here use `id1`. If upstream is refreshed, re-check that column.

## Spawning him

Apply `01_npc.sql` once. Then, for each place he should stand:

1. Stand there in-game and run `.gps`. It prints map and X/Y/Z; orientation is
   the direction you are facing.
2. Copy those into `02_spawn_one.sql`, pick an unused `@GUID` in
   `7000100`-`7000199`, apply.

`.npc add 7000000` also works for a throwaway spawn, but it allocates its own
guid outside the reserved band and will not survive a rebuild of the world
database. Use it to try a spot, not to keep one.

Both spawn files are re-runnable: they delete the guid before inserting, so
re-applying moves the existing Fizzik rather than creating a second one.

### On upstream's coordinates

All ten in `03_spawn_capitals.sql` are marked `placeholder` upstream — nobody
has stood on them. Some will sit inside geometry or float. Treat that file as a
starting point to correct with `.gps`, not as a working set.

## Controlling what he does

Everything is in `mod_bootlegger.conf`. `Bootleg.Enable = 0` ships as the
default, so the NPC greets and offers nothing until deliberately switched on.

Three service groups, each independently switchable:

- **Utilities** — rename, appearance, race, faction change. Applied as at-login
  flags. Race and faction change are the two worth thinking about before
  enabling on a live realm; both are priced high for that reason.
- **Professions** — advance a profession tier for gold. Master and GrandMaster
  ship disabled: those tiers are normally content gates rather than gold gates.
- **Instances** — reset heroic and raid locks.

Costs are in gold. `RequiredLevel = 0` means no level gate.

## Reserved ids

`7000000` template, `7000100`-`7000109` spawns, `7000200` gossip text. The band
was verified free on this server before vendoring — see `../VENDOR.md`. Keep new
spawns inside `7000100`-`7000199`.
