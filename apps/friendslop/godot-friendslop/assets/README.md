# Assets

## Credits

- **BinbunGrass** (`biomes/grassland/BinbunGrass/`) — grass shader + textures by
  [Binbun3D](https://binbun3d.itch.io/godot-grass), <https://binbun3d.itch.io/godot-grass>.
  Vendored as-is; base for the stylized forks below.
- **HexaquoGrass** (`biomes/grassland/HexaquoGrass/`) — geometry grass system by
  Karl Bittner, [godot-grass](https://git.hexaquo.at/karl/godot-grass)
  (Unlicense/public domain, from the Grass Rendering Series tutorials). Stalk
  meshes, grass + impostor-ground shaders, baked normals. Vendored with the
  object-bend feature enabled; driven by `src/world/grass_field.gd` (streaming +
  LOD) and `hexaquo_*.tres` materials.
- **BinbunGrass billboards** kept as the alternate grass style — swap materials in
  `scenes/main.tscn` and restore quad blades in `grass_field.gd` to switch back.

## Layout

```
audio/          music (ambient/combat/exploration/ui), sfx (ui/footsteps/weapons/
                creatures/environment/magic), voice (npc/player)
biomes/         one folder per biome; vendored packs live inside their biome
  grassland/    BinbunGrass pack + biome-specific props/textures
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
