# Cave Spawner Testing Instructions

## Current Status
✅ SubSceneSpawningSystem DISABLED (commented out)
✅ CaveFactorySystem ACTIVE with debug logging
✅ Clean Foundation-only approach

## Testing Steps

### 1. Create Zombie Prefab
1. Create a GameObject named "ZombiePrefab"
2. Add these components:
   - `MinionAuthoring` (set minionType = Tank)
   - `SpriteRendererAuthoring` (from NSprites Foundation)
3. Save as prefab

### 2. Create Cave in Scene
1. Create empty GameObject named "ZombieCave"
2. Add `CaveSpawnerAuthoring` component
3. Configure:
   - **Zombie Prefab**: Assign your zombie prefab
   - **Spawn Count**: 5 (test with multiple)
   - **Spawn Duration**: 3 seconds (quick for testing)
   - **Spawn Radius**: 10 units
   - **Spawn On Start**: ✅ Enabled

### 3. Run and Check Console
Watch for these logs:
- `"[CaveFactory] Processing X cave(s) at time Y"`
- `"[CaveFactory] Cave X timer: Y"`
- `"[CaveFactory] Cave X READY TO SPAWN!"`
- `"[CaveFactory] Cave X spawning Y zombies"`

### 4. Expected Behavior
- Cave spawns 5 zombies every 3 seconds
- Zombies appear in circle around cave
- Each spawn logged to console

### 5. Common Issues
- **"No cave entities found"**: Cave not in scene or missing components
- **"NULL prefab"**: Zombie prefab not assigned in CaveSpawnerAuthoring
- **No spawning**: Check console for timer logs

## Debug Output
The system now logs:
- Cave count and processing
- Timer countdowns
- Spawn events
- Prefab validation errors

This follows Age-of-Sprites pattern exactly!