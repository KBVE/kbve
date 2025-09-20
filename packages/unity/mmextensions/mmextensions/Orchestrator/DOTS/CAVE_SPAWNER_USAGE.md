# Cave Spawner System Usage

## Overview
The Cave Spawner system follows Age-of-Sprites' factory pattern where scene objects (caves) spawn runtime entities (zombies). This is more flexible and performant than direct entity spawning.

## How to Use

### 1. Create a Cave in Scene
1. Create an empty GameObject in your scene
2. Name it "ZombieCave" or similar
3. Position it where you want zombies to spawn from
4. Add the `CaveSpawnerAuthoring` component

### 2. Configure the Cave Spawner
- **Zombie Prefab**: Assign your zombie prefab (should have MinionAuthoring with Tank type)
- **Spawn Count**: Number of zombies per wave (1-20)
- **Spawn Duration**: Time between spawns in seconds
- **Spawn Radius**: Area around cave where zombies appear
- **Random Offset**: Random variation in spawn positions
- **Initial Delay**: Delay before first spawn
- **Spawn On Start**: Whether to start spawning immediately

### 3. Zombie Prefab Requirements
Your zombie prefab must have:
- `MinionAuthoring` component with `minionType = MinionType.Tank`
- `SpriteRendererAuthoring` from NSprites Foundation
- Any other components you want (pathfinding, combat, etc.)

### 4. Cave System vs Direct Spawning
- **Cave System**: Scene objects spawn runtime entities (like Age-of-Sprites)
- **Direct Spawning**: SubSceneSpawningSystem (still works but less flexible)

## Benefits of Cave System
1. **Scene-based design**: Place caves in level editor
2. **Individual control**: Each cave has its own settings
3. **Performance**: Uses Age-of-Sprites' proven batch spawning
4. **Flexibility**: Easy to add/remove/modify spawners
5. **Visual feedback**: See spawn areas in scene view

## Example Setup
1. Create zombie prefab with MinionAuthoring (Tank type)
2. Create empty GameObject named "Cave_01"
3. Add CaveSpawnerAuthoring component
4. Assign zombie prefab
5. Set spawn count to 5, duration to 10 seconds
6. Set spawn radius to 8 units
7. Enable "Spawn On Start"
8. Run the game - cave will spawn 5 zombies every 10 seconds!

## Debug Output
The system logs:
- "Cave X spawning Y zombies" when wave starts
- Individual zombie spawn positions
- "Cave X completed spawning Y zombies" when done

This follows the Age-of-Sprites pattern exactly!