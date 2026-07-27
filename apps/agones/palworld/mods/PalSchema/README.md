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
