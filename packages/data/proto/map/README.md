# Map Proto — Universal World & Map Database

Single source of truth for world geography, zones, terrain, tile-based dungeons, world objects, spawn points, and points of interest across all KBVE games.

## File

- **`mapdb.proto`** — complete world/map schema with registry

## Architecture

The map proto covers six layers:

| Layer                       | Purpose                                                      | Used By                                       |
| --------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| **Region**                  | Continents / worlds grouping multiple zones                  | All games                                     |
| **Zone**                    | Named region with bounds, biome, level range, terrain config | All — NPC `SpawnRule.zone`, quest `zone_refs` |
| **PointOfInterest**         | Cities, shrines, dungeons, landmarks, respawn points         | All games                                     |
| **TileDef / DungeonConfig** | Room types, exits, modifiers, hazards, boss rings            | discordsh dungeons                            |
| **TerrainConfig**           | Biome bands, noise params, water level, chunk system         | isometric                                     |
| **WorldObjectDef**          | Harvestable resources, decorations, interactables            | isometric                                     |

## Enums

| Enum              | Values           | Purpose                                                                                    |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `Biome`           | 15 + unspecified | Terrain classification (grassland, cave, dungeon, void, etc.)                              |
| `ZoneType`        | 10 types         | overworld, dungeon, instance, city, arena, safe, wilderness, raid, tutorial, event         |
| `RoomType`        | 13 types         | combat, treasure, trap, rest, merchant, boss, story, hallway, city, puzzle, secret, portal |
| `Direction`       | 6 directions     | N/S/E/W/Up/Down for tile exits and zone connections                                        |
| `RoomModifier`    | 11 types         | fog, blessing, cursed, flooded, burning, frozen, toxic, dark, holy, arcane                 |
| `WorldObjectType` | 21 types         | tree, rock, flower, mushroom, crystal, chest, portal, workbench, furnace, etc.             |
| `PoiType`         | 19 types         | city, town, dungeon, shrine, mine, port, arena, spawn point, quest hub, etc.               |
| `TerrainBand`     | 7 + unspecified  | water, sand, grass, dirt, stone, snow, lava                                                |
| `SpawnCategory`   | 7 types          | NPC, resource, object, enemy, boss, event, ambient                                         |

## Sub-messages by Domain

### Spatial Primitives

- **`GridPos`** — 2D tile coordinate (i32 x, y)
- **`WorldPos`** — 3D continuous position (float x, y, z)
- **`BoundsAABB`** — 3D axis-aligned bounding box
- **`Bounds2D`** — 2D bounding rectangle
- **`Color`** — Linear sRGB with optional alpha

### Zone & Region

- **`Zone`** — id, slug, name, type, biome, bounds, level range, connections, terrain config, water, POIs, spawn points, world objects, dungeon config, quest prerequisites, extensions
- **`ZoneConnection`** — links zones with direction, position, level/quest gating, bidirectional flag
- **`Region`** — groups zones into continents/worlds with gravity and day/night cycle

### Points of Interest

- **`PointOfInterest`** — named location with type, position, radius, NPC/quest/shop linkage, discoverable/fast-travel/respawn flags

### Dungeon / Tile System

- **`DungeonConfig`** — seed, max depth, boss ring distances, tile templates, room type weights
- **`TileDef`** — room type, exits, modifiers, hazards, enemy/loot/merchant/story refs, template name
- **`TileHazard`** — damage, status effect, trigger chance
- **`RoomSpawnWeight`** — room type distribution by depth

### Terrain Generation

- **`TerrainConfig`** — noise params (seed, scale, octaves, persistence, lacunarity), chunk system (size, load radius, tile size), height-based terrain bands
- **`TerrainBandDef`** — height range, color palette, cliff darkness factor
- **`WaterConfig`** — water level, colors, ripple/foam params, swim/drown rules

### World Objects

- **`WorldObjectDef`** — archetype template with type, variant, model, palette, interaction rules (harvestable, tool/skill required), physics (collision, occlusion), respawn
- **`WorldObjectPlacement`** — placed instance with position, rotation, scale, seed

### Spawn Points

- **`SpawnPoint`** — category, entity ref, position, spawn weight, max active, level range, respawn timing, time-of-day/weather/event/quest/flag conditions, group spawning

## Game Coverage

### discordsh

- `DungeonConfig` models the procedural dungeon: seed, boss rings at Manhattan distances, room type weights by depth
- `TileDef` captures room templates (Shattered Gallery, Bone Hollow, etc.) with exits, modifiers, hazards
- `RoomModifier` maps to existing Fog/Blessing/Cursed modifiers
- `TileHazard` maps to spikes/gas hazards

### isometric

- `TerrainConfig` models chunk-based terrain: 16x16 chunks, 2-octave noise, 6.0 max height
- `TerrainBandDef` maps to grass/dirt/stone/snow height bands with color palettes
- `WaterConfig` maps to water level 1.0 with cyan/deep-blue colors, ripple params
- `WorldObjectDef` covers trees (6 presets), rocks (5 kinds), flowers (10 archetypes), mushrooms (3 kinds)
- `SpawnPoint` with category, skill/tool requirements, respawn timing

### All games

- `Zone` is the universal location reference — NPC `SpawnRule.zone`, quest `zone_refs`, item `ItemSource.source_ref`
- `PointOfInterest` covers cities, shrines, merchants, dungeons, fast-travel points
- `Region` groups zones for world map navigation

## Registry

`MapRegistry` contains:

- `repeated Region regions` — worlds / continents
- `repeated Zone zones` — all zone definitions
- `repeated WorldObjectDef object_defs` — world object archetypes

## Related

- NPC proto: [`../npc/`](../npc/) (`SpawnRule.zone`, spawn points reference zones)
- Item proto: [`../item/`](../item/) (`SkillingInfo.resource_node` references world objects)
- Quest proto: [`../quest/`](../quest/) (`zone_refs` reference zones)
- Common types: [`../kbve/common.proto`](../kbve/common.proto)
