# Ground layers

`ground_albedo.png` and `ground_normal.png` are two strips of four stacked square layers, in the
order the terrain shader indexes them: grass, rock, sand, snow. The material slices each strip into
an array texture and builds its mip chain at load, because bevy generates no mipmaps itself.

Rebuild them with `kbve-bevy-terrain` (`kbve.bevy.terrain`, in packages/python/kbve); the
strips are the committed artifact, the
sources below are not in this repo.

| layer | source                                                                                 | license |
| ----- | -------------------------------------------------------------------------------------- | ------- |
| grass | Poly Haven `rocky_terrain_02`                                                          | CC0     |
| rock  | Poly Haven `rocks_ground_04`                                                           | CC0     |
| sand  | `desert_ground_01`, already in `apps/friendslop/godot-friendslop/assets/biomes/desert` | CC0     |
| snow  | Poly Haven `snow_01`                                                                   | CC0     |

Normals are OpenGL convention (green up), which is what bevy expects. Poly Haven's `nor_gl` EXR is
already in that convention, so nothing is flipped on the way in.
