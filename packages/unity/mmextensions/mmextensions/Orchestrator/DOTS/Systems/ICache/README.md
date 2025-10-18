# High-Performance Entity Cache System

## Overview

This is a high-performance, zero-GC entity caching system for Unity ECS/DOTS that provides extremely fast parallel data gathering and main-thread handoff capabilities. The system uses `EntityBlitContainer` directly as buffer elements for **maximum performance** and **zero wrapper overhead**.

## Architecture

The cache system consists of four core components:

### 1. EntityCacheStructures.cs
- `EntityFrameCacheTag`: Singleton component that marks the cache entity
- Uses `EntityBlitContainer` directly as buffer element for maximum performance
- Zero wrapper overhead for optimal memory layout and cache performance

### 2. EntityCacheBootstrap.cs
- `EntityCacheBootstrap`: System that initializes the cache singleton entity
- Runs once at startup with `[DisableAutoCreation]`
- Pre-allocates buffer capacity for 4096 entities

### 3. EntityBlitProduceSystem.cs
- `EntityBlitProduceSystem`: High-performance parallel producer system
- Runs in `SimulationSystemGroup`
- Uses change filters to only process modified entities
- Employs `NativeStream` for lock-free parallel data collection
- Works with `EntityComponent` and `LocalToWorld` components

### 4. EntityCacheDrainSystem.cs
- `EntityCacheDrainSystem`: Main-thread handoff system
- Runs in `PresentationSystemGroup` after producers
- Uses double-buffered pinned arrays with direct `Buffer.MemoryCopy` for maximum throughput
- Zero-copy data transfer with optimal memory layout

## Key Performance Features

### Zero-GC Hot Path
- All hot-path operations use unmanaged memory
- Direct `Buffer.MemoryCopy` operation with zero wrapper overhead
- Burst-compiled parallel jobs for maximum throughput
- Optimal memory layout for CPU cache efficiency

### Change-Filtered Updates
- Only processes entities with modified components
- Uses Unity's change version filtering for efficiency
- Minimizes unnecessary work per frame

### Lock-Free Parallel Collection
- `NativeStream` enables parallel data gathering without contention
- Each thread writes to its own stream partition
- Single merge operation consolidates all data

### Double-Buffered Handoff
- Ping-pong between two pinned managed arrays
- Prevents blocking between DOTS and managed systems
- Enables continuous processing without stalls

## Integration Points

### Existing Systems Integration
The cache system is designed to integrate with your existing infrastructure:

```csharp
// In EntityCacheDrainSystem.ProcessCacheData()
// Uncomment these when ready:

// EntityViewModel.UpdateFromCache(data, count);
// DOTSBridge.ProcessEntityUpdates(data, count);
```

### Component Requirements
Entities to be cached must have:
- `EntityComponent` (contains `EntityData`)
- `LocalToWorld` (for position data)

### Type-Specific Data
The system can be extended to handle type-specific data by:
1. Adding component type handles to the producer system
2. Checking for additional components in `GatherEntityDataJob`
3. Populating the appropriate fields in `EntityBlitContainer`

## Usage

### Manual Initialization
If using manual system creation:

```csharp
// Enable the bootstrap system once
World.GetOrCreateSystemManaged<EntityCacheBootstrap>().Enabled = true;
```

### Automatic Integration
The systems are designed to integrate automatically with the existing ECS world update cycle.

## Performance Characteristics

- **Memory**: Zero wrapper overhead with direct `EntityBlitContainer` storage
- **CPU**: Burst-compiled jobs with optimal memory layout for cache efficiency
- **Transfer**: Direct `Buffer.MemoryCopy` for maximum throughput
- **Latency**: Single-frame cache updates with minimal processing overhead
- **Scalability**: Lock-free parallel processing scales linearly with entity count
- **Efficiency**: Change filters ensure only modified entities are processed

### Performance Optimization Benefits

**Direct Buffer Usage vs Wrapper Pattern:**
- ✅ **Zero Memory Overhead**: No wrapper struct allocation
- ✅ **Better Cache Locality**: Contiguous `EntityBlitContainer` layout
- ✅ **Faster Copying**: Direct `Buffer.MemoryCopy` instead of field-by-field copy
- ✅ **Reduced Indirection**: Direct access to data without `.Value` field access

## Configuration

### Buffer Capacity
Default cache capacity is 4096 entities. Modify in `EntityCacheBootstrap.OnCreate()`:

```csharp
buffer.EnsureCapacity(8192); // Increase for larger scenes
```

### Update Semantics
Choose between full-frame or delta updates in `EntityCacheDrainSystem.OnUpdate()`:

```csharp
// For delta-only updates, uncomment:
// state.EntityManager.GetBuffer<EntityFrameCache>(cacheEntity).Clear();
```

## Development Notes

### Debug Logging
Development builds include cache statistics logging:
```
[EntityCacheDrainSystem] Processed 1250 entity cache entries
```

### Extension Points
The system can be extended to support:
- Multiple entity type shards (similar to the original Agent/Structure/Item pattern)
- Spatial filtering and predictive caching
- Custom serialization for network transmission
- Performance metrics and monitoring

## Migration from Legacy Cache

This system replaces the legacy LRU cache implementation with:
- Better performance through parallel processing
- Lower memory overhead through change filtering
- Simplified integration through existing data structures
- Enhanced scalability for large entity counts

The new system maintains compatibility with `EntityBlitContainer` while providing significant performance improvements.

## Updated Generics Integration

### EntityBlitContainer Enhancement
The `EntityBlitContainer` has been updated to implement `IBufferElementData`, enabling it to be used directly in DOTS buffer systems while maintaining full compatibility with existing code:

- **Backward Compatible**: All existing serialization and bridge code continues to work unchanged
- **GenericBlit<T>**: No changes needed - continues to handle protobuf serialization
- **IEntityData<T>**: No changes needed - remains a marker interface for type safety
- **Buffer Usage**: Can now be used directly in `DynamicBuffer<EntityBlitContainer>` scenarios

This dual-purpose design allows `EntityBlitContainer` to serve both as:
1. A high-performance buffer element for caching systems
2. A serializable data container for network and storage operations