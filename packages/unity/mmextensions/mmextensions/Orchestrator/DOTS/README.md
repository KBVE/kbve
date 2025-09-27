# Unity DOTS ECS System Documentation

## Overview
This directory contains a high-performance Entity Component System (ECS) implementation using Unity's Data-Oriented Technology Stack (DOTS). The system is designed to handle massive entity counts (100,000+) with optimal performance through Burst compilation and parallel job processing.

## Architecture Summary
- **Technology Stack**: Unity DOTS, Burst Compiler, Unity.Entities, Unity.Mathematics
- **Dependency Injection**: VContainer integration for lifecycle management
- **Design Pattern**: Factory pattern for entity spawning (Age-of-Sprites inspired)
- **Performance**: Supports 100,000+ simultaneous entities with spatial indexing

## Directory Structure

```
DOTS/
├── Authoring/          # MonoBehaviour to ECS conversion components
├── Components/         # ECS component data structures
├── Configuration/      # Runtime configuration and settings
├── Data/              # Data registries and lookups
├── Spatial/           # Spatial indexing and pathfinding systems
├── Systems/           # ECS systems for processing entities
└── Utilities/         # Helper classes and utilities
```

## Core Files Reference

### Management & Configuration

#### DOTSWorldManager.cs
- **Purpose**: Manages ECS World lifecycle and system initialization
- **Key Features**: VContainer integration, world creation, system registration
- **Dependencies**: DOTSConfiguration, SpatialIndexConfiguration, CombatConfiguration

#### DOTSLifetimeScope.cs
- **Purpose**: VContainer dependency injection configuration
- **Key Features**: Registers all DOTS services and configurations for DI

#### AssemblyInfo.cs
- **Purpose**: Assembly metadata and configuration

### Components (Data Structures)

#### Components/MinionData.cs
- **Purpose**: Core entity data component
- **Fields**: Health, Speed, AttackDamage, AttackRange, DetectionRange, Faction, Type, StateFlags
- **Enums**: MinionType (Basic, Fast, Tank, Ranged, Flying, Boss), FactionType, MinionStateFlags

#### Components/ZombieComponents.cs
- **Purpose**: Simplified zombie-specific components
- **Components**: ZombieTag, ZombieHealth, ZombieSpeed, ZombieDirection
- **Pattern**: Follows Age-of-Sprites minimal component design

#### Components/ZombieHordeComponents.cs
- **Purpose**: Horde management for mass spawning
- **Components**: ZombieHordeTag, ZombieHordeSettings (formation, spacing), ZombieLink buffer
- **Features**: Supports 32-wide grid formations for massive hordes

#### Components/FactoryComponents.cs
- **Purpose**: Cave/spawner system components
- **Components**: FactoryData (prefab, count, duration), FactoryTimer
- **Pattern**: Factory pattern for batch entity creation

#### Components/CombatComponents.cs
- **Purpose**: Combat interaction components
- **Components**: DamageDealer, CombatTarget, DamageReceiver
- **Features**: Attack cooldowns, target tracking, damage application

#### Components/VisualComponents.cs
- **Purpose**: Visual representation and animation components
- **Integration**: Works with sprite rendering systems

#### Components/SpatialPosition.cs
- **Purpose**: Position tracking for spatial queries
- **Features**: Optimized for KD-Tree spatial indexing

#### Components/EntityPrefabComponents.cs
- **Purpose**: Prefab reference and instantiation data

### Authoring (MonoBehaviour to ECS)

#### Authoring/MinionAuthoring.cs
- **Purpose**: Converts GameObject minions to ECS entities
- **Baker**: Processes MonoBehaviour data into ECS components
- **Configuration**: Health, Speed, Type, Faction settings

#### Authoring/ZombieAuthoring.cs
- **Purpose**: Simple zombie entity conversion
- **Pattern**: Minimal authoring following Age-of-Sprites pattern
- **Components Created**: ZombieTag, ZombieHealth, ZombieSpeed

#### Authoring/FactoryAuthoring.cs
- **Purpose**: Cave/spawner authoring for scene-based design
- **Features**: Visual spawn radius, wave configuration
- **Usage**: Place in scene for spawn points

### Systems (Processing Logic)

#### Systems/FactorySystem.cs
- **Purpose**: Handles batch entity spawning
- **Performance**: Burst compiled, supports 100k+ entities
- **Features**: Wave spawning, formation placement, horde creation
- **Pattern**: Parallel job with EntityCommandBuffer

#### Systems/ZombieMovementSystem.cs
- **Purpose**: Chaotic zombie movement behavior
- **Features**: Random direction changes, wobble movement
- **Optimization**: 2% direction change rate for performance

#### Systems/MinionMovementSystem.cs
- **Purpose**: General minion movement processing
- **Features**: Speed-based movement, direction following

#### Systems/MinionOrientationSystem.cs
- **Purpose**: Sprite rotation and facing direction
- **Integration**: CharacterOrientation2D override support

#### Systems/MinionCombatSystem.cs
- **Purpose**: Combat interaction processing
- **Features**: Attack processing, damage application, target validation
- **Performance**: Parallel processing with spatial queries

#### Systems/MinionBehaviorSystem.cs
- **Purpose**: AI behavior state management
- **Features**: State transitions, behavior selection

#### Systems/MinionAnimationSystem.cs
- **Purpose**: Animation state synchronization
- **Integration**: NSprites animation system

#### Systems/MinionDebugSystem.cs
- **Purpose**: Debug visualization and logging
- **Features**: Runtime debugging tools

#### Systems/MinionDestructionSystem.cs
- **Purpose**: Entity cleanup and destruction
- **Features**: Death handling, entity recycling

#### Systems/CombatVisualsSystem.cs
- **Purpose**: Combat visual effects
- **Features**: Damage numbers, hit effects

#### Systems/SimpleMinionMovementSystem.cs
- **Purpose**: Simplified movement for basic entities

#### Systems/ViewCullingSystem.cs
- **Purpose**: Automatic visibility culling based on camera frustum and distance
- **Features**: Frustum culling, distance culling, performance metrics
- **Performance**: Burst compiled, runs every 2 frames, handles 100k+ entities
- **Integration**: Works with ViewRadius and Visible components

### Spatial Indexing & Pathfinding

#### Spatial/Systems/SpatialIndexingSystem.cs
- **Purpose**: Maintains spatial indices for queries
- **Algorithm**: KD-Tree with periodic rebuilding
- **Performance**: Rebuilds every 30 frames, parallel construction
- **Capacity**: 10,000 initial, 16 leaf size

#### Spatial/Systems/SpatialQuerySystem.cs
- **Purpose**: Processes spatial queries
- **Features**: Range queries, nearest neighbor search

#### Spatial/KDTree/KDTreeAdvanced.cs
- **Purpose**: Advanced KD-Tree implementation
- **Features**: Parallel building, optimized queries
- **Memory**: Native collections with Burst

#### Spatial/KDTree/KDTreeBuilder.cs
- **Purpose**: Parallel KD-Tree construction
- **Optimization**: Job system integration

#### Spatial/KDTree/KDTreeNode.cs
- **Purpose**: Tree node structure
- **Features**: Optimized for cache performance

#### Spatial/AStar/Components/ZombiePathfindingComponents.cs
- **Purpose**: Pathfinding data components
- **Features**: Path storage, target tracking

#### Spatial/AStar/Systems/ZombieTargetingSystem.cs
- **Purpose**: Target selection and path planning
- **Integration**: Works with spatial queries

### Utilities

#### Utilities/NativePriorityHeap.cs
- **Purpose**: Priority queue for pathfinding
- **Memory**: Native collection for Burst

#### Utilities/CombatUtilities.cs
- **Purpose**: Combat calculation helpers
- **Features**: Damage formulas, range checks

#### Utilities/SpatialIndexFactory.cs
- **Purpose**: Factory for creating spatial indices
- **Pattern**: Abstract factory pattern

### Configuration

#### Configuration/MinionSpriteConfiguration.cs
- **Purpose**: Sprite rendering configuration
- **Integration**: NSprites settings

#### Configuration/MinionSpriteRenderData.cs
- **Purpose**: Runtime sprite data
- **Features**: Animation sets, sprite references

### Data

#### Data/MinionPrefabRegistry.cs
- **Purpose**: Central registry for entity prefabs
- **Features**: Runtime prefab lookup


## Performance Characteristics

### Entity Limits
- **Tested**: 100,000+ simultaneous zombies
- **Recommended**: 10,000-50,000 for stable 60 FPS
- **Formation**: 32-wide grids for mass spawning

### Optimization Features
- Burst compilation on all systems
- Parallel job processing
- Spatial indexing for efficient queries
- Periodic KD-Tree rebuilding (every 30 frames)
- Native collections for zero GC
- **Automatic view culling**: Only visible entities are processed
- **Frustum culling**: Entities outside camera view are disabled
- **Distance culling**: Far entities beyond max view distance are hidden

### Memory Patterns
- Structure of Arrays (SoA) for cache efficiency
- Component pooling for reduced allocations
- Native memory management

## Integration Points

### Dependencies
- Unity.Entities
- Unity.Mathematics
- Unity.Transforms
- Unity.Burst
- Unity.Collections
- VContainer (Dependency Injection)
- NSprites Foundation (Sprite Rendering)

### External Systems
- CharacterOrientation2D (Override support)
- NSprites Animation System
- Unity Physics (Optional)

## Design Patterns

### Factory Pattern
Cave spawners create runtime entities from prefabs, following Age-of-Sprites design for flexibility and performance.

### Component Pattern
Minimal components with single responsibility, optimized for cache coherency.

### System Pattern
Each system handles one aspect of entity behavior, enabling parallel processing.

## Future Development Notes

### Recommended Improvements
1. **Level of Detail (LOD)**: Reduce processing for distant entities
2. **Entity Pooling**: Reuse entities instead of destroy/recreate
3. **Behavior Trees**: More complex AI beyond wandering
4. **Network Synchronization**: Multiplayer support
5. **Performance Metrics**: Runtime profiling integration

### Known Limitations
- Direction changes limited to 2% per frame for performance
- KD-Tree rebuild interval fixed at 30 frames
- Maximum formation width of 32 entities

## Quick Start

1. Create a zombie prefab with `ZombieAuthoring` component
2. Add `FactoryAuthoring` to a GameObject in scene
3. Configure spawn parameters (count, duration, radius)
4. Set zombie culling radius (default 3.0 units)
5. Assign zombie prefab to factory
6. Run scene - entities spawn with automatic culling

### View Culling System

The ViewCullingSystem automatically manages entity visibility:
- **Automatic**: Entities with `ViewRadius` component are culled automatically
- **Performance**: Culling runs every 2 frames to reduce overhead
- **Configurable**: Adjust max view distance via `ViewCullingSettings`
- **Debug**: Logs visible/culled counts every second

Example zombie configuration:
- Health: 100
- Speed: 2.0
- CullingRadius: 3.0 (slightly larger than visual size)

## Debugging

Enable `MinionDebugSystem` for runtime visualization.
Check console for spawn logs ("Cave X spawning Y zombies").
Use Unity's ECS debugging windows for component inspection.

---

*This system is optimized for massive-scale entity simulation with a focus on performance and scalability.*