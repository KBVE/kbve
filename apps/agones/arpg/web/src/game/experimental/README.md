# experimental

Shelved, not wired into the game. Park half-baked features here until they're ready.

## bushes.ts

Harvestable surface bushes (mirror of the tree system). Fully built end-to-end but the
art never looked right, so it's parked.

**Revive (client):** re-import in `IsoArpgScene.ts` and restore the wiring that mirrors
trees — preload, prewarm pool, `predict/unpredictChunkBushes`, the `BUSH_REF` adopt
branch in the entity-create path, the despawn branch, `reconcileBushes`, the
floor-change clear, and `tryHarvestAdjacentBush` in the Space handler. (Bushes are
walkable — do NOT add them to `envBlocked` / `markEnvDirty`.)

**Revive (server):** add `game::stream_bushes` back to the `SimSet::Spawn` schedule in
`apps/agones/arpg/server/src/main.rs` and drop the `dead_code` allow on `stream_bushes`
in `creatures.rs`. Everything else (`BushState`, `bush_at`, `spawn_bush`, the harvest
branch in `apply_fells`, `register_env("bush")`) is still live.

**Texture:** `scripts/gen-bush-sheet.py` (procedural baker, inputs in `scripts/bush-src/`)
bakes `public/assets/arcade/arpg/environment/bushes/bush_01.webp`. The look needs work —
this is the part to redo.
