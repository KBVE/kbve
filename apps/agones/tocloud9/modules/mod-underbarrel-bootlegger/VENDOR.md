# Vendored: mod-bootlegger

| | |
|---|---|
| Upstream | https://github.com/berubejd/mod-bootlegger |
| Commit | `a7a1766d1ca66fe65cac8f5d3461665980a3e948` (2026-07-14) |
| License | AGPL-3.0 (`LICENSE`, unmodified) |
| Vendored | 2026-08-20 |

Source is byte-identical to upstream at that commit, except:

- `CLAUDE.md` and `AGENTS.md` are not vendored. They are upstream's agent
  instructions and would be read as project instructions inside this repo.
- This file.

The directory is named `mod-underbarrel-bootlegger` after the NPC (Fizzik
Underbarrel). Everything inside keeps upstream's `mod_bootlegger` naming —
the config filename is read from the source, and AzerothCore discovers a
module by directory, not by internal name, so the rename is safe and keeps
diffs against upstream readable.

## Status

Vendored only. Nothing builds or loads it yet:

- not referenced by `gameserver/Dockerfile`
- `data/sql/db-world/mod_bootlegger.sql` is not applied
- `conf/mod_bootlegger.conf.dist` is not deployed
- no NPC is spawned

Wiring it into the image means copying the directory into `/repo/modules/`
before the core's cmake step, and placing the conf at
`/repo/bin/etc/modules/mod_bootlegger.conf`.

## Reserved IDs

Upstream claims a 7M band (`ids.lock.yaml`): creature_template `7000000`,
spawn guids `7000100`–`7000109`, npc_text `7000200`.

Checked against this server's world database on 2026-08-20 — the band is
free, and nothing from mod-playerbots reaches it (bots live in
`acore_playerbots` and consume `characters.guid`, a different namespace
from creature entries and spawn guids):

| check | count |
|---|---|
| `creature_template.entry` in 7000000–7000299 | 0 |
| `creature.guid` in 7000000–7000299 | 0 |
| `npc_text.ID` in 7000000–7000299 | 0 |

Highest ids otherwise in use: `creature_template.entry` 3460603,
`creature.guid` 5300678.

Note `ids.lock.yaml` also references `mod-uac` and `mod-guildhall` bands.
Those are upstream author's other modules, not deployed here; the file is
kept unmodified so future upstream diffs stay clean.

## Updating

Re-clone upstream at the new commit, drop `.git`, `CLAUDE.md` and
`AGENTS.md`, copy over the tree, and update the commit hash above.
