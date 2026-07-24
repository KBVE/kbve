# chef_paldon_yumsay

Open-source Palworld **data-pak** mod that adds custom cooking foods.

## What this is

A data-only pak (`ChefPaldonYumsay_P.pak`) that overrides Palworld cooking DataTables to add
new foods. It is **not** a UE4SS lua mod and loads from the game `Pal/Content/Paks/` directory.

Because the foods are **new items**, the pak must be installed on **both the client and the
server**. Vanilla clients cannot use these foods. A server-only, vanilla-client-safe variant
would require editing existing rows (rebalance) instead of adding new items — not done here.

## Attribution

Concept inspired by the removed Steam Workshop mod "Bloody Potatoes" (workshop id
`3766350861`, author `alialiali`). **No data, tables, text, or assets are copied from it.**
All definitions here are authored independently. License: MIT.

## Layout

- `foods/*.toml` — source-of-truth food definitions (edit these to add/change foods).
- `art/` — size-labeled in-game icon placeholder slots (Phase 3).
- `workshop/` — Steam Workshop listing assets (placeholders; publish deferred).
- `build/` — Phase 2 cook pipeline (UE 5.1 modkit) documentation and scripts.
- `dist/` — compiled `_P.pak` output (gitignored).

## Building

Phase 1 (now): `nx run agones-palworld-chef-food:validate` and
`nx run agones-palworld-chef-food:generate-placeholders`.

Phase 2 (UE 5.1 modkit, in CI / UE build VM against the licensed server's game paks): see
`build/README.md`. `nx run agones-palworld-chef-food:cook` is a documented stub until then.

## Replacing placeholder art

Placeholders are size-labeled squares generated from `art/slots.json`. Replace any PNG in
`art/` or `workshop/` with real art of the same dimensions; do not re-run the generator over
files you have replaced.
