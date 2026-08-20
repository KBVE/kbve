# Vendored: mod-bootlegger

|          |                                                         |
| -------- | ------------------------------------------------------- |
| Upstream | https://github.com/berubejd/mod-bootlegger              |
| Commit   | `a7a1766d1ca66fe65cac8f5d3461665980a3e948` (2026-07-14) |
| License  | AGPL-3.0 (`LICENSE`, unmodified)                        |
| Vendored | 2026-08-20                                              |

Source is byte-identical to upstream at that commit, except:

- `CLAUDE.md` and `AGENTS.md` are not vendored. They are upstream's agent
  instructions and would be read as project instructions inside this repo.
- `src/mod_bootlegger.cpp`: the entry point is renamed
  `Addmod_bootleggerScripts` -> `Addmod_underbarrel_bootleggerScripts`.
  Required by the directory name; see below.
- This file, and everything under `kbve/`.

The directory is named `mod-underbarrel-bootlegger` after the NPC (Fizzik
Underbarrel).

**The directory name is not free.** AzerothCore's generated `ModulesLoader`
derives an entry-point symbol from the directory, replacing dashes with
underscores, and calls it from `AddModulesScripts()`. A directory named
`mod-underbarrel-bootlegger` therefore requires the module to define
`Addmod_underbarrel_bootleggerScripts()`. Leaving upstream's
`Addmod_bootleggerScripts()` in place fails at link time with:

```
undefined reference to `Addmod_underbarrel_bootleggerScripts()'
```

That one function name is the only source change. Everything else — config
keys, filenames, class names — keeps upstream's `mod_bootlegger` naming, so
diffs against upstream stay readable.

## Status

Vendored only. Nothing builds or loads it yet:

- not referenced by `gameserver/Dockerfile`
- `data/sql/db-world/mod_bootlegger.sql` is not applied, and would fail if it
  were: it targets `creature`.`id`, while this core's schema has `id1`/`id2`/`id3`
- `conf/mod_bootlegger.conf.dist` is not deployed
- no NPC is spawned

Wiring it into the image means copying the directory into `/repo/modules/`
before the core's cmake step, and placing `kbve/mod_bootlegger.conf` at
`/repo/bin/etc/modules/mod_bootlegger.conf`.

Our own conf values, split spawn SQL, and the operating runbook live in
`kbve/` — nothing outside that directory is edited, so upstream diffs stay
clean. See `kbve/README.md`.

## Reserved IDs

Upstream claims a 7M band (`ids.lock.yaml`): creature_template `7000000`,
spawn guids `7000100`–`7000109`, npc_text `7000200`.

Checked against this server's world database on 2026-08-20 — the band is
free, and nothing from mod-playerbots reaches it (bots live in
`acore_playerbots` and consume `characters.guid`, a different namespace
from creature entries and spawn guids):

| check                                        | count |
| -------------------------------------------- | ----- |
| `creature_template.entry` in 7000000–7000299 | 0     |
| `creature.guid` in 7000000–7000299           | 0     |
| `npc_text.ID` in 7000000–7000299             | 0     |

Highest ids otherwise in use: `creature_template.entry` 3460603,
`creature.guid` 5300678.

Note `ids.lock.yaml` also references `mod-uac` and `mod-guildhall` bands.
Those are upstream author's other modules, not deployed here; the file is
kept unmodified so future upstream diffs stay clean.

## Updating

Re-clone upstream at the new commit, drop `.git`, `CLAUDE.md` and
`AGENTS.md`, copy over the tree, and update the commit hash above.
