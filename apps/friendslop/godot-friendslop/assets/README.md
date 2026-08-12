# Assets

## Credits

- **Grass** (`biomes/grassland/grass/`) — geometry grass system by
  Karl Bittner, [godot-grass](https://git.hexaquo.at/karl/godot-grass)
  (Unlicense/public domain, from the Grass Rendering Series tutorials). Stalk
  meshes, grass + impostor-ground shaders, baked normals. Vendored with the
  object-bend feature enabled; driven by `src/world/grass_field.gd` (streaming +
  LOD) and the `grass.tres` / `ground.tres` materials.
- **Characters** (`characters/quaternius_ubc/`) — Universal Base Characters Kit by
  [Quaternius](https://quaternius.com) (CC0 1.0 Universal, public domain).
  Source version: `.blend` masters plus Godot/Unity/Unreal projects. Vendored as
  GLB repacked from the kit's glTF exports, with image URIs repointed at a shared
  `textures/` folder so all archetypes reference one texture set. The kit ships no
  animations. Rig is Unreal Mannequin naming (`pelvis`, `spine_01`, `upperarm_l`,
  `thigh_l`, ...), 65 joints, identical across every body and hairstyle. Base
  colour maps are greyscale and multiply by a colour parameter, so skin and hair
  tone are values rather than textures.
- **Animations** (`characters/quaternius_ubc/animations/`) — Universal Animation
  Library 1 and 2 by [Quaternius](https://quaternius.com) (CC0 1.0 Universal).
  254 clips over the same 65-joint rig as the character kit; the two libraries
  are bit-identical rigs, so they merge without retargeting between them. The
  in-place builds are vendored, not the `_RM` root-motion ones, but the `_RM`
  root translation is where the authored ground speeds in `character_rig.gd`
  came from (walk 1.01 m/s, jog 5.36, sprint 8.25, sideways roughly half).
  Godot's importer strips the `_Loop` suffix and sets loop mode from it, so
  `Idle_Loop` in the source is `Idle` in the library.
- Both Quaternius sets are imported through `quaternius_bone_map.tres`, which
  maps the kit's Unreal-Mannequin bones onto `SkeletonProfileHumanoid` (53 of 56
  -- the rig has no eye or jaw bones). Retargeting every glb through it is what
  makes the animation rigs and the body rigs agree; without it their rest poses
  differ by up to 17 degrees at the neck.
- Early prototyping used the BinbunGrass billboard pack by
  [Binbun3D](https://binbun3d.itch.io/godot-grass) — removed after the geometry
  grass replaced it; credit kept for the inspiration.

## Layout

```
audio/          music (ambient/combat/exploration/ui), sfx (ui/footsteps/weapons/
                creatures/environment/magic), voice (npc/player)
biomes/         one folder per biome; vendored packs live inside their biome
  grassland/    grass pack (meshes/shaders/materials) + biome props/textures
  forest/ desert/ tundra/ swamp/ volcanic/ coast/
characters/     player / npc / creatures, each split models/textures/animations
environment/    shared cross-biome: props (buildings/flora/rocks/ruins/furniture),
                skyboxes, terrain (textures/meshes), water, weather
fx/             particles, shaders, decals
items/          weapons, armor, consumables, resources, quest
ui/             fonts, icons, themes, cursors, hud
```

## Conventions

- Third-party packs vendored whole in their own folder with license/credit noted here.
- Biome-specific content goes under its biome; shared content under `environment/`.
- `.gitkeep` marks planned-but-empty folders — delete when real content lands.
