# KBVE Spider

Custom pre-rendered isometric spider for Factorio 2.0. Drops in as a hostile `unit` (biter-class).

## Features

- 16-direction body + shadow sprites at 256×256 source, baked into direction-major sheets.
- Animations included: Idle, Walk, Run, Attack1–3, Death1–2, Hit (Front/Back/Left/Right), Nervous.
- Body and shadow rendered as separate Factorio sprite layers.
- HP 80, melee range 1.5, 12 physical damage, vision 30.

## Credits

- **Spider model:** _Animated Isometric Pale Spider_ by **engvee** — https://engvee.itch.io/animated-isometric-pale-spider
- **Music:** **OpenFret**
- **Mod author:** KBVE — https://kbve.com

## Layout

```
kbve-spider/
├── info.json
├── data.lua
├── settings.lua            # runtime + startup mod settings
├── control.lua             # event hooks (hatch loop, hit reactions, sprint, flee, nervous)
├── changelog.txt
├── README.md
├── thumbnail.png           # 144×144 mod-portal listing image
├── locale/en/
│   └── kbve-spider.cfg     # entity/item/setting names + descriptions
├── migrations/
│   └── README.md           # add <version>.lua here when storage shape changes
├── prototypes/
│   └── spider.lua          # entity + corpse + sticker prototypes
├── graphics/
│   ├── icon.png            # mipmap strip (120×64 = 64+32+16+8) for the spider icon
│   ├── icon-egg.png        # mipmap strip (120×64) for the spider-egg item/entity
│   ├── item/spider-egg.png # egg sprite source (64×64)
│   └── entity/spider/      # 16-direction body + shadow sheets per animation
└── tools/                  # bake_sheets / optimize_pngs / test_mod / build_zip / make_icon
```

## Mod settings

Configurable in **Mod settings → Map** (runtime-global) and **Settings → Mods** (startup):

| Setting                               | Type    | Default | Tunes                                                        |
| ------------------------------------- | ------- | ------- | ------------------------------------------------------------ |
| `kbve-spider-hatch-seconds`           | runtime | 30      | Seconds between placing a Spider Egg and the Ally hatching.  |
| `kbve-spider-sprint-chance`           | runtime | 0.45    | Probability per 3-second tick that a chasing spider sprints. |
| `kbve-spider-flee-health-threshold`   | runtime | 0.3     | Fraction of max HP below which a spider switches to `flee`.  |
| `kbve-spider-nervous-pick-count`      | runtime | 3       | Random idle spiders that twitch every 15-second pass.        |
| `kbve-spider-sprint-speed-multiplier` | startup | 1.9     | Sprint sticker movement modifier (baked into the prototype). |
| `kbve-spider-ally-max-health`         | startup | 60      | Ally spider HP (wild spider stays at 80).                    |

## nx targets

| Target     | Cmd                                                               | Notes                                                                                           |
| ---------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `test`     | `./kbve.sh -nx kbve-spider:test`                                  | Static validation — info.json, FRAMES table, sheet dims, RGBA mode. ~1s.                        |
| `bake`     | `SPIDER_SRC=~/Downloads/Spider256 ./kbve.sh -nx kbve-spider:bake` | Rebuild direction-major sheets from per-direction source.                                       |
| `optimize` | `./kbve.sh -nx kbve-spider:optimize`                              | Lossless `zopflipng` recompress. Cached per file via `*.png.opt` markers; rerunning is a no-op. |
| `package`  | `./kbve.sh -nx kbve-spider:package`                               | Build `dist/kbve-spider_<version>.zip` in Factorio release layout.                              |
| `e2e`      | `./kbve.sh -nx kbve-spider:e2e`                                   | Currently aliases `test`; will swap to Factorio-headless once Dockerized.                       |
| `clean`    | `./kbve.sh -nx kbve-spider:clean`                                 | Remove `dist/` and all `*.png.opt` markers.                                                     |

## Re-baking sprites

Source assets are not vendored. To rebuild the sheets from a fresh `Spider256/` drop:

```bash
python3 tools/bake_sheets.py \
  --src ~/Downloads/Spider256 \
  --out graphics/entity/spider
```

If the in-game heading is rotated relative to movement, re-bake with a row shift (each step = 22.5°):

```bash
python3 tools/bake_sheets.py --src ~/Downloads/Spider256 --out graphics/entity/spider --direction-shift 8
```

Source layout expected by the baker:

```
Spider256/<Anim>/<Anim>_<Body|Shadow>_<deg>.png
```

with `<deg>` ∈ `{000, 022, 045, ..., 337}` and each PNG a 256×256-tile grid (left→right, top→bottom).

## Wired vs. bundled animations

The vanilla `unit` prototype only takes one walking animation and one attack animation, so the current proto wires:

| Slot                          | Animation |
| ----------------------------- | --------- |
| `run_animation`               | Walk      |
| `attack_parameters.animation` | Attack1   |

The remaining sheets (Idle, Run, Attack2/3, Death1/2, Hit\_\*, Nervous) are baked and shipped so a future `control.lua` can hot-swap animations on damage / state events.

## Runtime behavior (control.lua)

| Event                          | Behavior                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `on_entity_damaged`            | Spawn directional `Hit_<side>` corpse + 30-tick stagger sticker (-80% speed).                                                                                                                                                              |
| `on_entity_damaged` (HP < 30%) | Set spider command to `defines.command.flee` from attacker + apply sprint sticker. One-shot per spider.                                                                                                                                    |
| `on_built_entity` (egg)        | Track placer's `player_index`, schedule hatch tick, draw a floating "Hatching… Ns" countdown via `rendering.draw_text` above the egg.                                                                                                      |
| `on_nth_tick(60)` (hatch loop) | Decrement the floating countdown. On expiry: destroy the egg, create the ally on the placer's force, set `last_user`, spawn a vanilla `explosion` puff.                                                                                    |
| `on_nth_tick(120)` (follow)    | For each ally on each surface, find its owner (or nearest connected same-force player within 64 tiles) and issue `defines.command.go_to_location` with `radius = 3` and `by_enemy` distraction. Skips when within 4 tiles to avoid jitter. |
| `on_entity_died`               | Default Death1 corpse from prototype + 50% chance to layer Death2 on top. Ally deaths chat-print to the owner with the position + alert sound.                                                                                             |
| `on_nth_tick(180)` (every 3s)  | For spiders in an attack group: 45% chance to apply `kbve-spider-sprint` (1.9× speed, 3s, 10s cooldown).                                                                                                                                   |
| `on_nth_tick(900)` (every 15s) | Pick 3 random idle spiders, overlay Nervous animation as one-shot corpse (visual only).                                                                                                                                                    |

### Ally ownership

`storage.ally_owners[unit_number] = player_index` is set at hatch and cleared on death. The follow loop falls back to the nearest connected same-force player when the original owner has disconnected or moved to another surface, so allies are never permanently stuck.

## Releasing to the Factorio mod portal

1. `./kbve.sh -nx kbve-spider:test` — must be green.
2. `./kbve.sh -nx kbve-spider:package` — produces `dist/kbve-spider_<version>.zip`.
3. Bump `info.json::version` + add a `changelog.txt` entry for any new release.
4. Go to https://mods.factorio.com → **My Mods** → **Upload a Mod**.
5. First release: fill out name, title, summary (description from info.json is fine), category (`enemies`), tags (`enemies`, `cheats` for editor-spawn). Upload `dist/kbve-spider_<version>.zip`.
6. Subsequent releases: upload a new zip — mod portal reads the version from `info.json` and rejects duplicates.

`thumbnail.png` at the zip root is the listing image (144×144, generated by `tools/make_icon.py`).

## Local install

```bash
ln -s "$(pwd)" "$HOME/Library/Application Support/factorio/mods/kbve-spider"
```

Then enable **KBVE Spider** in the in-game Mods menu and spawn via the editor (`/editor` → entities → search `kbve-spider`).

## License

MIT for the mod code. Third-party assets retain their original licenses — see the itch.io page above for the spider model terms before redistribution.
