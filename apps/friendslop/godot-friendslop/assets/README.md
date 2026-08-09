# Assets

## Credits

- **Grass** (`biomes/grassland/grass/`) — geometry grass system by
  Karl Bittner, [godot-grass](https://git.hexaquo.at/karl/godot-grass)
  (Unlicense/public domain, from the Grass Rendering Series tutorials). Stalk
  meshes, grass + impostor-ground shaders, baked normals. Vendored with the
  object-bend feature enabled; driven by `src/world/grass_field.gd` (streaming +
  LOD) and the `grass.tres` / `ground.tres` materials.
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
