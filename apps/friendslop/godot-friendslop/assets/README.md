# Assets

## Credits

- **BinbunGrass** (`biomes/grassland/BinbunGrass/`) — grass shader + textures by
  [Binbun3D](https://binbun3d.itch.io/godot-grass), <https://binbun3d.itch.io/godot-grass>.
  Vendored as-is; grass/ground materials referenced from `scenes/main.tscn`.

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
