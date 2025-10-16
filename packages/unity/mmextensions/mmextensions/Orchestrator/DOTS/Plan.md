# DOTS Entity Architecture Plan

## Overview
Universal ECS architecture that supports hover/selection/UI systems for all entity types (creatures, structures, items, resources, etc.) without duplication and with maximum future-proofing.

## Core Architecture

### Universal Entity Data
**EntityBlit** - Present on ALL entities (~36 bytes)
- `FixedBytes16 Ulid` - Universal unique identifier
- `EntityType Type` - Creature, Structure, Resource, Item, etc.
- `EntityActionFlags ActionFlags` - Universal action state
- `float3 WorldPos` - Universal world position

### Specialized Entity Data
Entity-specific blits contain ONLY the data unique to that entity type:

**ResourceBlit** (~8-12 bytes) - Resource-specific data only
- `byte Type` - Wood, Stone, Metal, Food
- `byte Flags` - IsHarvestable, IsDepleted
- `ushort Amount` - Current amount
- `ushort MaxAmount` - Maximum capacity
- `ushort HarvestYield` - Harvest yield amount
- `float HarvestTime` - Time required to harvest

**StructureBlit** (~18 bytes) - Structure-specific data only
- `byte StructureType` - Building type
- `byte Level` - Structure level
- `int Health` - Current health
- `int MaxHealth` - Maximum health
- `float ProductionRate` - Production speed
- `float ProductionProgress` - Current production progress

**CombatantBlit** (~22 bytes) - Combat entity data only
- `byte CombatantType` - Monster, Unit, Player
- `byte Level` - Character level
- `int Health` - Current health
- `int MaxHealth` - Maximum health
- `float AttackDamage` - Base attack damage
- `float AttackSpeed` - Attack speed multiplier
- `float MoveSpeed` - Movement speed

## Universal Systems

### Hover System
- Works on **any entity** via `EntityBlit.WorldPos`
- Uses raycasting/distance checks against all entities
- Returns `EntityBlit.Ulid` and `EntityBlit.Type`

### Selection System
- Works on **any entity** via `EntityBlit.Ulid`
- Maintains selected entity reference universally
- UI systems query based on `EntityBlit.Type`

### UI System
1. Get `EntityBlit.Type` from selected/hovered entity
2. Switch on entity type to fetch appropriate specialized blit:
   - `EntityType.Resource` → Query `ResourceBlit`
   - `EntityType.Structure` → Query `StructureBlit`
   - `EntityType.Combatant` → Query `CombatantBlit`
3. Display entity-specific UI with combined data

## Optimization Standards

### All Blits Must Implement:
- `IEquatable<T>` for type-safe equality
- `[StructLayout(LayoutKind.Sequential)]` for memory optimization
- `override GetHashCode()` with unsafe unchecked arithmetic
- `==` and `!=` operators
- Proper float comparison using `math.abs(a - b) < math.EPSILON`

### Memory Layout
- Sequential struct layout for cache efficiency
- Minimal specialized blit sizes
- No data duplication between EntityBlit and specialized blits

## Future Entity Types

When adding new entity types:

1. **Add EntityType enum value**
2. **Create specialized blit** (e.g., `ItemBlit`, `VehicleBlit`)
3. **Implement optimization standards** (IEquatable, unsafe hashcode, etc.)
4. **Update UI system switch statement**
5. **Systems automatically work** via EntityBlit

## Benefits

- ✅ **No Duplication** - Ulid, WorldPos, EntityType only in EntityBlit
- ✅ **Future-Proof** - Any entity type works with existing systems
- ✅ **Memory Efficient** - Specialized blits contain only relevant data
- ✅ **Universal Systems** - Hover, selection, UI work with all entities
- ✅ **Type Safety** - Strong typing with IEquatable implementations
- ✅ **Performance** - Optimized equality comparisons and hash codes
- ✅ **Maintainable** - Clear separation of concerns

## Implementation Status

### Entity Blits (Optimized)
- ✅ EntityBlit - Optimized with IEquatable and unsafe hashcode
- ✅ StructureBlit - Optimized with IEquatable and unsafe hashcode
- ✅ CombatantBlit - Optimized with IEquatable and unsafe hashcode
- ✅ ItemBlit - Optimized with IEquatable and unsafe hashcode
- ✅ ResourceBlit - Optimized and removed Ulid/WorldPos duplication

### Universal Systems (Complete)
- ✅ PlayerHoverSystem - Universal entity detection via physics raycasting
- ✅ EntityHoverSelectSystem - Universal selection (replaces ResourceHoverSelectSystem)
- ✅ EntityToVmDrainSystem - Universal data gathering for all entity types
- ✅ EntityViewModel - Thread-safe universal reactive view model
- ✅ EntityDOTSBridge - Universal UI bridge for all entity types

### Components
- ✅ PlayerHover - Universal hover detection component
- ✅ PlayerPointerRay - Universal mouse ray component
- ✅ SelectedEntity - Universal selection component
- ✅ EntityBlitContainer - Universal data container with convenience properties

### Migration Status
- ✅ Removed ResourceToVmDrainSystem (redundant with EntityToVmDrainSystem)
- ✅ Updated DOTSLifetimeScope to use EntityViewModel
- 🔄 ResourceViewModel/DOTSBridge - Keep for UI backward compatibility, mark as deprecated
- ❌ ResourceID - Should be removed (redundant with EntityBlit.Ulid)