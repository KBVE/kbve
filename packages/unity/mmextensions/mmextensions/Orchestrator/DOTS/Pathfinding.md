# ECS Pathfinding Optimization Strategy

## Current Performance Issues
- Performance drops from 140 FPS to 15-30 FPS with pathfinding enabled
- Real-time pathfinding calculations for thousands of entities
- No caching mechanism in place
- Direct movement system without proper pathfinding infrastructure

## Grid Architecture

### Map Structure
- **Total Grid**: 10x10 sectors (as defined in MapSettingsAuthoring)
- **Map Size**: 5000 units total
- **Sector Size**: 500 units per sector (5000 / 10)
- **Grid Reference**: Grid[0,0] to Grid[9,9]
- **Spawn Distribution**: Entities spawn within specific grid sectors

### Hierarchical Grid System
```
Level 1: Sectors (10x10) - High-level navigation
Level 2: Local Grid (50x50 per sector) - Detailed pathfinding
Level 3: Flow Fields - Direction vectors for movement
```

## Caching Strategy

### 1. Sector-Level Cache (Inter-Sector Navigation)

#### Sector Graph
- Pre-calculate connections between all sectors
- Store gateway points between adjacent sectors
- Cache optimal paths between sector pairs
- Memory: 100 sectors × 100 sectors × ~8 bytes = ~80KB

#### Gateway Points
- Define 4-8 gateway points per sector edge
- Pre-calculate optimal entry/exit points
- Store as waypoint nodes for sector transitions
```
Gateway Structure:
- Position (float3)
- Connected sectors (int2)
- Cost to adjacent gateways (float)
```

### 2. Flow Field Cache (Intra-Sector Movement)

#### Local Flow Fields
- Generate flow fields on-demand per sector
- Cache most frequently used flow fields (LRU cache)
- Use 4-bit direction encoding (8 directions + null)
- Memory per flow field: 50×50 cells × 4 bits = 1.25KB

#### Direction Encoding
```
0: No movement (obstacle/destination)
1: North (0, 1)
2: Northeast (1, 1)
3: East (1, 0)
4: Southeast (1, -1)
5: South (0, -1)
6: Southwest (-1, -1)
7: West (-1, 0)
8: Northwest (-1, 1)
```

#### Cache Management
- Maximum cached flow fields: 20-30 per sector
- Total memory: 30 fields × 10 sectors × 1.25KB = ~375KB
- Eviction policy: Least Recently Used (LRU)

### 3. Path Cache (Frequently Used Routes)

#### Hot Path Detection
- Track most common source-destination pairs
- Pre-calculate and cache complete paths
- Update cache when obstacles change

#### Cache Structure
```
PathCacheEntry:
- FromSector (int2)
- ToSector (int2)
- Waypoints (float3[])
- LastUsed (timestamp)
- UseCount (int)
```

## Implementation Phases

### Phase 1: Sector Navigation System
1. Create sector graph with connections
2. Implement gateway point system
3. Build sector-to-sector pathfinding
4. Cache sector paths

### Phase 2: Flow Field Generation
1. Implement flow field generator per sector
2. Add direction encoding/decoding
3. Create LRU cache for flow fields
4. Integrate with movement system

### Phase 3: Horde Movement Optimization
1. Implement leader-follower pattern
2. Single pathfinding calculation for leader
3. Followers use local avoidance
4. Formation maintenance system

### Phase 4: Dynamic Updates
1. Obstacle change detection
2. Incremental cache updates
3. Path validation system
4. Cache invalidation strategy

## Horde Movement Strategy

### Leader-Follower System
- Designate one entity per horde as leader
- Leader performs full pathfinding
- Followers maintain formation around leader
- Local collision avoidance only

### Formation Patterns
```
Formations:
- Circle: Members distributed in ring around leader
- Line: Members follow in single file
- Block: Members form rectangular formation
- Wedge: V-formation for movement
```

### Group Movement Benefits
- Single pathfinding calculation per group
- Reduced computational load by 90%+
- Natural flocking behavior
- Better visual coherence

## Memory Budget

### Current Approach Issues
- Full flowmap cache: 200×200×200×200 = 6.4GB (impractical)
- No compression or optimization

### Optimized Approach
```
Sector Graph: ~80KB
Gateway Points: ~10KB
Flow Field Cache: ~375KB
Path Cache: ~200KB
Obstacle Map: 10KB (bit array)
-------------------
Total: < 1MB
```

## Performance Targets

### Goals
- Maintain 60+ FPS with 10,000 entities
- Path calculation < 1ms per request
- Cache hit rate > 80%
- Memory usage < 1MB total

### Metrics to Track
- Path requests per second
- Cache hit/miss ratio
- Average path calculation time
- Memory usage per cache type
- FPS with various entity counts

## Integration with Existing Systems

### Current Components to Modify
1. `ZombieMovementSystem` - Add flow field following
2. `ZombieNavigation` - Include sector awareness
3. `ZombiePathfindingState` - Add cache status

### New Systems to Create
1. `SectorNavigationSystem` - High-level pathfinding
2. `FlowFieldSystem` - Generate and cache flow fields
3. `PathCacheSystem` - Manage path caching
4. `HordeMovementSystem` - Group movement coordination

## Optimization Techniques

### Spatial Partitioning
- Use sector-based queries
- Reduce search space for pathfinding
- Enable parallel processing per sector

### Temporal Optimization
- Stagger path updates across frames
- Priority-based calculation queue
- Predictive pre-caching

### Data Compression
- 4-bit direction encoding
- Shared waypoint references
- Compressed obstacle maps

## Testing Strategy

### Performance Benchmarks
1. Baseline: Current direct movement
2. With sector navigation only
3. With flow fields added
4. Full caching system
5. Horde optimization enabled

### Stress Tests
- 1,000 entities
- 5,000 entities
- 10,000 entities
- 20,000 entities (stretch goal)

### Cache Effectiveness
- Measure hit rates
- Track memory usage
- Monitor eviction frequency
- Analyze hot paths

## Future Enhancements

### Advanced Features
- Hierarchical pathfinding (HPA*)
- Dynamic obstacle prediction
- Multi-threaded path calculation
- GPU-accelerated flow fields

### Scalability
- Support for larger maps (500×500)
- Dynamic sector sizing
- Adaptive cache sizing
- Cloud-based path pre-calculation

## References
- Unity DOTS Best Practices
- Flow Field Pathfinding Papers
- Hierarchical Pathfinding (HPA*)
- Group Movement in RTS Games