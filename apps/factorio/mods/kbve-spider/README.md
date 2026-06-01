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
├── changelog.txt
├── README.md
├── prototypes/
│   └── spider.lua          # unit prototype + rotated animation helper
├── graphics/entity/spider/ # baked direction-major sheets (Body + Shadow per anim)
│   ├── Idle_Body.png
│   ├── Idle_Shadow.png
│   ├── Walk_Body.png
│   └── ...
└── tools/
    └── bake_sheets.py      # source per-direction sheets → Factorio sheets
```

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

| Event                          | Behavior                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `on_entity_damaged`            | Spawn directional `Hit_<side>` corpse + 30-tick stagger sticker (-80% speed).                            |
| `on_entity_damaged` (HP < 30%) | Set spider command to `defines.command.flee` from attacker + apply sprint sticker. One-shot per spider.  |
| `on_entity_died`               | Default Death1 corpse from prototype + 50% chance to layer Death2 on top.                                |
| `on_nth_tick(180)` (every 3s)  | For spiders in an attack group: 45% chance to apply `kbve-spider-sprint` (1.9× speed, 3s, 10s cooldown). |
| `on_nth_tick(900)` (every 15s) | Pick 3 random idle spiders, overlay Nervous animation as one-shot corpse (visual only).                  |

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
