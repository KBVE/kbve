# Apex Predator (creature)

Rendered isometric reptilian apex predator. Unlike the player `ranger` class
(per-angle flipbook PNGs, 16 directions), this creature ships as packed sprite
sheets: each `Sprite_N.png` is **4096×4096**, a uniform **8×8 grid of 512×512
frames** (64 slots, row-major index 0–63).

Each sheet packs one or two animation states. Every state is split into a
**cardinal** half (N/E/W/S) and a **diagonal** half (NW/NE/SW/SE), each direction
occupying a contiguous run of frames.

## Direction → frame order (within a state's frame range)

8 directions, in this slot order:

| cardinal block | diagonal block |
| -------------- | -------------- |
| N, E, W, S     | NW, NE, SW, SE |

So a 64-frame state (8 frames/dir) lays out as:
`N 0-7 · E 8-15 · W 16-23 · S 24-31 · NW 32-39 · NE 40-47 · SW 48-55 · SE 56-63`.
A 24-frame state (3 frames/dir) lays out cardinal 0-11, diagonal 12-23.

## Sheet → state map

| sheet      | state       | total | cardinal                             | diagonal |
| ---------- | ----------- | ----- | ------------------------------------ | -------- |
| `Sprite_1` | Walking     | 64    | 0-31                                 | 32-63    |
| `Sprite_2` | Running     | 64    | 0-31                                 | 32-63    |
| `Sprite_3` | Idle        | 24    | 0-11                                 | 12-23    |
| `Sprite_3` | Resting     | 24    | 24-35                                | 36-47    |
| `Sprite_4` | Attack 1    | 24    | 0-11                                 | 12-23    |
| `Sprite_4` | Attack 2    | 24    | 24-35                                | 36-47    |
| `Sprite_5` | Use Skill   | 24    | 0-11                                 | 12-23    |
| `Sprite_5` | Block       | 24    | 24-35                                | 36-47    |
| `Sprite_6` | Evade       | 24    | 0-11                                 | 12-23    |
| `Sprite_6` | Get Hit     | 24    | 24-35                                | 36-47    |
| `Sprite_7` | Critical HP | 24    | 0-11                                 | 12-23    |
| `Sprite_7` | Woozy       | 24    | 24-35                                | 36-47    |
| `Sprite_8` | Behavior    | 24    | 0-11                                 | 12-23    |
| `Sprite_8` | Dead        | 8     | 24-31 (all directions share one run) |

`ApexPredator_Large.png` is a single hero/preview render (not a sheet).

Blobs are tracked in Git LFS at the arpg Forgejo endpoint — see the `.lfsconfig`
one level up. Push/pull with `./kbve.sh -lfs arpg <push|pull>`.
