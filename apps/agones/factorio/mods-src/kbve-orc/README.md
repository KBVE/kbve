# KBVE Orc

Custom pre-rendered isometric Orc Warrior for Factorio 2.0. Neutral creature with a per-force reputation system: kill orcs and the orc faction turns hostile; offer gifts (or buy KBVE Orc Tribute from the Exchange) and they warm up to you.

Sister mod to [`kbve-spider`](../kbve-spider/) — shares the 16-direction Body+Shadow bake pipeline and Nx targets.

## Asset

Model: [Isometric Orc Warrior Male](https://engvee.itch.io/isometric-orc-warrior-male) by **engvee**.

Source files are expected at `~/Downloads/orc_assets/` with one subfolder per animation, each containing 16 directions × 2 layers (Body + Shadow) of 256px-tile PNG strips.

Available animations baked into this mod:

| Anim          | Frames | Source folder  |
| ------------- | ------ | -------------- |
| Idle_Armed    | 16     | Idle_Armed/    |
| Walk_Armed    | 20     | Walk_Armed/    |
| Run_Armed     | 24     | Run_Armed/     |
| Attack_01     | 24     | Attack_01/     |
| Attack_02     | 30     | Attack_02/     |
| Attack_03     | 24     | Attack_03/     |
| Death_Armed   | 24     | Death_Armed/   |
| Death_Unarmed | 16     | Death_Unarmed/ |
| Hit_Armed     | 20     | Hit_Armed/     |
| Hit_Block     | 20     | Hit_Block/     |
| Hit_Unarmed   | 20     | Hit_Unarmed/   |
| Roar          | 30     | Roar/          |

## Reputation system

Reputation is stored **per player force** in `storage.orc_rep[force_index]`, clamped to `[-100, +100]`. Each player force starts at `0` (Neutral).

| Range       | Tier     | Behavior                                                   |
| ----------- | -------- | ---------------------------------------------------------- |
| -100 .. -50 | Hated    | Orcs attack on sight. Cease-fire disabled both ways.       |
| -49 .. -10  | Wary     | Orcs attack if player force unit is within 12 tiles.       |
| -9 .. +9    | Neutral  | Orcs ignore unless attacked first (default).               |
| +10 .. +49  | Friendly | Cease-fire held. Orcs wander, don't aggro.                 |
| +50 .. +100 | Revered  | Future: follow / trade / buff. Currently same as Friendly. |

Deltas:

- Kill an orc: `-5` (configurable via `kbve-orc-rep-kill-penalty`).
- Gift accepted: `+1` to `+15` depending on item — see `GIFT_VALUES` in `control.lua`.
- Daily decay toward `0`: `5 rep/day` (configurable). Keeps long sessions from getting permanently locked into a tier.

Whenever a force's rep crosses a tier threshold, `control.lua` syncs `force:set_cease_fire("kbve-orcs", ...)` both ways so orc AI behaves as the table above describes.

## Gift mechanic

Drop a whitelisted item entity within 4 tiles of any orc and the nearest orc will consume the dropped stack on the next 1 Hz gift-sweep. The orc's `Roar` animation plays as a "thank you" cue, and the dropping player's force gains the item's gift value as reputation.

Whitelist (default values, tunable in `control.lua`):

```lua
GIFT_VALUES = {
    ["raw-fish"]         = 3,
    ["coal"]             = 1,
    ["iron-plate"]       = 2,
    ["copper-plate"]     = 2,
    ["steel-plate"]      = 5,
    ["kbve-orc-tribute"] = 15,
}
```

The `kbve-orc-tribute` item ships with this mod. It has no crafting recipe — the only intended source is the KBVE Exchange (`mods-local/kbve/modules/market.lua`).

## Dev workflow

All Nx targets run from the repo root:

```bash
# Bake source PNG strips → Factorio direction-major sheets
./kbve.sh -nx run kbve-orc:bake

# Optional: lossless re-compress baked sheets (requires zopflipng)
./kbve.sh -nx run kbve-orc:optimize

# Static validation (info.json, sheet sizes, locale, settings)
./kbve.sh -nx run kbve-orc:test

# Zip mod for Factorio mod portal upload (dist/kbve-orc_<version>.zip)
./kbve.sh -nx run kbve-orc:package
```

Source root for `bake`: override the default `~/Downloads/orc_assets` via the `ORC_SRC` env var.

## License

MIT — see https://kbve.com/legal/. Sprite assets carry the engvee asset pack license; see the engvee itch.io page above for redistribution terms.
