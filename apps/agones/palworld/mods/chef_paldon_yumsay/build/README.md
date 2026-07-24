# Phase 2 cook pipeline (UE 5.1 modkit)

Turns the `foods/*.toml` definitions into a real `ChefPaldonYumsay_P.pak`. Runs in CI or a
UE build VM where both Unreal Engine and the licensed Palworld game files exist — not on a
dev box without the game.

## Prerequisites

- **UE 5.1.x** editor. Palworld runs on UE 5.1; assets must be cooked with a matching engine.
  (The KBVE UE infra is UE 5.7 — a 5.1 project/toolchain must be provisioned for this.)
- A Palworld modkit / blank UE 5.1 project that imports Palworld's DataTable row structs.
- `repak` (github.com/trumank/repak) to extract base assets.
- The licensed dedicated-server game paks at `/palworld/Pal/Content/Paks/`.

## Steps

1. **Validate** the definitions: `python3 build/validate_foods.py foods`.
2. **Extract base tables** with `repak`: unpack `DT_ItemRecipeDataTable_Common`,
   `DT_ItemDataTable_Common`, `DT_StatusEffectFood`, `DA_StaticItemDataAsset`,
   `DT_ItemNameText_Common`, `DT_ItemDescriptionText_Common` from the game paks.
   A `_P.pak` overrides whole assets, so the full vanilla rows must be carried through.
3. **Apply rows**: import each food's rows (from `foods/*.toml`) into the base tables via the
   UE DataTable import path.
4. **Cook + pack**: `UnrealPak` produces `dist/ChefPaldonYumsay_P.pak`.
5. **Deploy**: an overlay step (analogous to the repo's `overlay.sh` for UE4SS) stages the
   pak into the game `Pal/Content/Paks/` at container start. The pak is required on both
   client and server.

## Open items

- Provision a UE 5.1.x cook toolchain (infra is 5.7).
- Validate the imported row structs against Palworld's `.usmap` / extracted base tables.
- Finalize seed-food balancing numbers in the TOMLs.
