# PalSchema overlay (KBVE JSON mods)

PalSchema (Okaetsu) is a JSON-driven data-table / blueprint framework for
Palworld, running as a C++ UE4SS mod (`main.dll`). It is the clean path for
**data-level content** — custom NPCs/characters, items, recipes, shop tables —
versus PalForge's runtime Lua reflection.

## How it's wired

- The framework binary is **not vendored here**. `Dockerfile` downloads the
  pinned release (`PALSCHEMA_VERSION` + `PALSCHEMA_SHA256`, verified against the
  GitHub asset digest) and extracts it to `/opt/palchatrelay/PalSchema`
  (`dlls/main.dll`, `enabled.txt`, `mods/`).
- This directory (`mods/PalSchema/`) is the **KBVE overlay**: any JSON under
  `mods/` here is copied into the framework's `Mods/PalSchema/mods/` at
  container start by `overlay.sh`, then enabled via `mods.txt`.

## Adding an NPC / content mod

Drop a `*.json` PalSchema mod under [`mods/`](./mods/). See the PalSchema docs
for the JSON schema (data-table blueprint edits, character definitions, spawn
tables). Files here are layered on top of the pinned framework — no binary
changes needed.

## Updating the framework

Bump `PALSCHEMA_VERSION` and `PALSCHEMA_SHA256` in `apps/agones/palworld/Dockerfile`.
Get the digest from:

```bash
gh api repos/Okaetsu/PalSchema/releases/latest \
  --jq '.assets[] | select(.name|endswith(".zip")) | {name, digest}'
```

## Guild chest (KBVEGuildChest)

`mods/KBVEGuildChest/blueprints/guildchest_slots.json` overrides
`BP_PalGameSetting_C.GuildChestSlotNum`. Structural reference: the "Guild Chest
Slots" Nexus PalSchema mod (which ships 2466); KBVE runs 108. Server-side only —
clients need no mod, but the value must match across a server restart or stored
items beyond the new cap become unreachable.

## Vendored third-party mods

`mods/ZZZ_MelwenMods_MulticlimateShields/` — Multiclimate Shields 2.1 by
MelwenMods ([Nexus 2643](https://www.nexusmods.com/palworld/mods/2643)). Grants
`TemperatureResist_Heat*Cold*` passives to `Shield_Ultra` / `Shield_SF` /
`Shield_07`. Kept under its upstream `ZZZ_` prefix so it loads last and wins
item overrides; spaces stripped from the folder name. Server-side only.
Re-download from Nexus to update — do not hand-edit.

## Shops (KBVEShops)

Shop tables (`DT_ItemShopCreateData`) are generated from MDX frontmatter under
`apps/kbve/astro-kbve/src/content/docs/palworld/palshop/*.mdx` by
`scripts/generate-palworld-shops.mjs` (nx target `astro-kbve:gen:palworld-shops`).
Edit the MDX, regenerate, commit both. Item ids and layout take structural
reference from the Hex Reworked Shop (Nexus) PalSchema mod; all prices, stock,
and curation are KBVE-authored.
