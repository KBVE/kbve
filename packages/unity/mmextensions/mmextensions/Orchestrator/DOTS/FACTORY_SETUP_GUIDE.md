# Factory System Setup Guide - Age-of-Sprites Pattern

## ✅ Clean Implementation Complete

We now have an **exact match** to Age-of-Sprites' factory pattern:
- Single, simple `FactorySystem` using IJobEntity
- Clean `FactoryData` and `FactoryTimer` components
- Simple `FactoryAuthoring` for scene setup

## 🎯 How to Test

### 1. Create Your Minion Prefab
1. Create GameObject named "ZombiePrefab"
2. Add `MinionAuthoring` component:
   - Set `minionType = Tank` (for zombies)
   - Configure health, speed, etc.
3. Add `SpriteRendererAuthoring` from NSprites Foundation
4. Save as prefab

### 2. Create Factory in Scene
1. Create empty GameObject named "ZombieFactory"
2. Add `FactoryAuthoring` component
3. Configure:
   - **Prefab**: Assign your ZombiePrefab
   - **Spawn Offset**: (0, 0) or adjust as needed
   - **Duration**: 2.0 (spawn every 2 seconds)
   - **Spawn Count**: 5 (spawns 5 zombies per wave)
   - **Random Initial Duration**: Optional

### 3. Run and Verify
- Factory spawns `SpawnCount` entities every `Duration` seconds
- Entities appear at factory position + offset
- Uses efficient batch spawning with NativeArray

## 🔧 Architecture Benefits

### Matches Age-of-Sprites Exactly:
```
FactoryAuthoring → FactoryData + FactoryTimer → FactorySystem → Spawned Entities
```

### Clean Separation:
- `/Authoring/` - FactoryAuthoring.cs, MinionAuthoring.cs
- `/Components/` - FactoryData, FactoryTimer, MinionData
- `/Systems/` - FactorySystem.cs

### Performance:
- Burst compiled IJobEntity
- Parallel processing
- Batch instantiation with NativeArray

## 📝 Key Differences from Before
- **REMOVED**: 3 conflicting spawning systems
- **REMOVED**: Complex cave/wave spawner abstractions
- **ADDED**: Single clean factory pattern
- **RESULT**: Exact match to Age-of-Sprites

## 🚀 Next Steps
1. Test basic factory spawning
2. Verify multiple entities spawn
3. Add your unique components after base works
4. Scale up with additional factories

This is the foundation Age-of-Sprites uses - proven, simple, scalable!