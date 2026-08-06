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

`mods/KBVEGuildChest/blueprints/guild_chest.json` overrides
`BP_PalGameSetting_C.GuildChestSlotNum`; KBVE runs 108. Inspired by the "Guild
Chest Slots" Nexus PalSchema mod (which ships 2466). Server-side only — clients
need no mod, but lowering the value across a restart makes stored items past the
new cap unreachable.

## Shields (KBVEShields)

`mods/KBVEShields/items/shields.jsonc` grants `TemperatureResist_Heat*Cold*`
passives to shields: `Shield_03` (Giga) and `Shield_04` (Tera) at tier 1,
`Shield_Ultra` at tier 1, `Shield_SF` at tier 2, `Shield_07` at tier 3.
Inspired by Multiclimate
Shields by MelwenMods ([Nexus 2643](https://www.nexusmods.com/palworld/mods/2643));
values are KBVE-authored. Server-side only.

## Merchants (KBVEMerchants)

`mods/KBVEMerchants/npcs/no_capture.jsonc` sets `CaptureRateCorrect` to `0.0` on
every merchant row in `DT_PalHumanParameter`. Fixes merchants being caught with a
Pal Sphere and never respawning — the NPC spawner does not re-fire for a captured
merchant, so the vendor is gone until the world reloads.

The `npcs` folder name is required: PalSchema's human loader registers itself as
`PalModLoaderBase("npcs")`. There is no `IsUncapturable` field on the
`PalCharacterParameterDatabaseRow` struct, so `CaptureRateCorrect` is the only
lever; vanilla ships every merchant at `0.1` and `Male_Police_old` at `0.0`.

Only row ids verified against a real `DT_PalHumanParameter` dump are listed.
This matters: the loader **adds a new NPC row** when an id is not found
(`FindRowUnchecked` → `Add`), so a typo silently creates junk data rather than
erroring. Confirm additions against a dump before extending the list.

## Shops (KBVEShops)

Shop tables (`DT_ItemShopCreateData`) are generated from MDX frontmatter under
`apps/kbve/astro-kbve/src/content/docs/palworld/palshop/*.mdx` by
`scripts/generate-palworld-shops.mjs` (nx target `astro-kbve:gen:palworld-shops`).
Edit the MDX, regenerate, commit both. Item ids and layout take structural
reference from the Hex Reworked Shop (Nexus) PalSchema mod; all prices, stock,
and curation are KBVE-authored.
