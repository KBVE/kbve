# Unity WebGL Bridge - JavaScript/React Side

Complete documentation for the React/TypeScript side of the Unity WebGL communication bridge.

## Overview

This folder contains the React/TypeScript implementation for bi-directional communication with Unity WebGL builds. It works in conjunction with the Unity JavaScript Bridge located at `/unity/bugwars/Assets/Scripts/JavaScriptBridge/`.

## Architecture

```
┌─────────────────────────────────────────────────┐
│         React/Astro Application                 │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  AstroUnityGameContainer.astro            │  │
│  │  └─ SupaProvider                          │  │
│  │     └─ ReactUnity.tsx                     │  │
│  └───────────────────────────────────────────┘  │
│              ↓                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  unityService.ts (Singleton)              │  │
│  │  - sendToUnity()                          │  │
│  │  - on() event subscription                │  │
│  │  - onArrayData() for typed arrays         │  │
│  │  - Supabase integration                   │  │
│  │  - Window event listeners                 │  │
│  └───────────────────────────────────────────┘  │
│              ↓                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  react-unity-webgl                        │  │
│  │  - sendMessage()                          │  │
│  │  - addEventListener()                     │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────────────┐
│         Unity WebGL Build                       │
│  ┌───────────────────────────────────────────┐  │
│  │  WebGLBridge.cs + WebGLBridge.jslib       │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Files

- **ReactUnity.tsx** - React component that embeds Unity WebGL
- **unityService.ts** - Singleton service for Unity communication
- **typeUnity.ts** - TypeScript type definitions
- **AstroUnityGameContainer.astro** - Astro wrapper component
- **index.ts** - Barrel exports

## Installation & Setup

### 1. Install Dependencies

```bash
npm install react-unity-webgl @supabase/supabase-js
```

### 2. Use in Your Page

```astro
---
// pages/game.astro
import AstroUnityGameContainer from '@/components/unity-react/AstroUnityGameContainer.astro';
import type { UnityConfig } from '@/components/unity-react/typeUnity';

const unityConfig: UnityConfig = {
	loaderUrl: '/UnityWebGL/Build/bugwars.loader.js',
	dataUrl: '/UnityWebGL/Build/bugwars.data',
	frameworkUrl: '/UnityWebGL/Build/bugwars.framework.js',
	codeUrl: '/UnityWebGL/Build/bugwars.wasm',
};
---

<AstroUnityGameContainer
	config={unityConfig}
	width="100%"
	height="100vh"
	showFullscreenButton={true}
/>
```

## Usage Examples

### 1. Listening for Unity Events

#### In a React Component

```typescript
import { useEffect } from 'react';
import { unityService, UnityEventType } from '@/components/unity-react';
import type { PlayerSpawnEvent, ChunkEvent } from '@/components/unity-react/typeUnity';

function GameDashboard() {
  useEffect(() => {
    // Listen for player spawned
    const unsubPlayer = unityService.on(UnityEventType.PLAYER_SPAWNED, (event) => {
      const playerData = event.data as PlayerSpawnEvent;
      console.log('Player spawned:', playerData);
      console.log('Position:', playerData.position);
    });

    // Listen for chunk loaded
    const unsubChunk = unityService.on(UnityEventType.CHUNK_LOADED, (event) => {
      const chunkData = event.data as ChunkEvent;
      console.log(`Chunk (${chunkData.chunkX}, ${chunkData.chunkZ}) loaded`);
      console.log(`Vertices: ${chunkData.vertexCount}`);
    });

    // Listen for score updates
    const unsubScore = unityService.on(UnityEventType.SCORE_UPDATED, (event) => {
      console.log('Score updated:', event.data);
    });

    // Cleanup
    return () => {
      unsubPlayer();
      unsubChunk();
      unsubScore();
    };
  }, []);

  return <div>Game Dashboard</div>;
}
```

#### Listen for All Events (Wildcard)

```typescript
useEffect(() => {
	const unsub = unityService.on('*', (event) => {
		console.log('Unity event:', event.type, event.data);
	});

	return () => unsub();
}, []);
```

### 2. Sending Messages to Unity

#### Send JSON Data

```typescript
import { unityService } from '@/components/unity-react';

// Send session data
unityService.sendSessionData({
	userId: 'user-123',
	email: 'player@example.com',
});

// Send a command
unityService.sendCommand('TeleportPlayer', ['10', '0', '20'], 'user-123');

// Send raw message
unityService.sendToUnity({
	gameObject: 'WebGLBridge',
	method: 'OnMessage',
	parameter: JSON.stringify({
		type: 'CustomCommand',
		payload: JSON.stringify({ action: 'heal', amount: 50 }),
	}),
});
```

#### Send Binary Data

```typescript
import { unityService, typedArrayToBase64 } from '@/components/unity-react';

// Send Uint8Array
const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
unityService.sendBinaryData(binaryData);

// Send Float32Array
const floatData = new Float32Array([1.5, 2.7, 3.9]);
unityService.sendFloat32Array(floatData);

// Send regular array
const arrayData = [1, 2, 3, 4, 5];
unityService.sendArrayData(arrayData);
```

### 3. Receiving Binary/Array Data from Unity

```typescript
import { unityService } from '@/components/unity-react';
import type { UnityArrayDataEvent } from '@/components/unity-react/typeUnity';

useEffect(() => {
	// Listen for terrain heightmap (Float32Array)
	const unsubHeightmap = unityService.onArrayData(
		'TerrainData_Heightmap',
		(event: UnityArrayDataEvent) => {
			console.log('Received heightmap:', event.dataType, event.length);

			if (event.dataType === 'Float32Array') {
				const heightmap = event.data as Float32Array;
				// Process heightmap data
				console.log('First height value:', heightmap[0]);
			}
		},
	);

	// Listen for mesh vertices (Float32Array)
	const unsubMesh = unityService.onArrayData(
		'MeshGenerated_Vertices',
		(event) => {
			if (event.dataType === 'Float32Array') {
				const vertices = event.data as Float32Array;
				console.log(
					'Received mesh with',
					vertices.length / 3,
					'vertices',
				);

				// Convert to Three.js geometry or visualize
				// Every 3 floats = one vertex (x, y, z)
			}
		},
	);

	// Listen for mesh triangles (Int32Array)
	const unsubTriangles = unityService.onArrayData(
		'MeshGenerated_Triangles',
		(event) => {
			if (event.dataType === 'Int32Array') {
				const triangles = event.data as Int32Array;
				console.log('Received', triangles.length / 3, 'triangles');
			}
		},
	);

	return () => {
		unsubHeightmap();
		unsubMesh();
		unsubTriangles();
	};
}, []);
```

### 4. Supabase Integration

#### Load Data from Supabase (via Unity)

```typescript
import { unityService } from '@/components/unity-react';

// Unity will handle the Supabase call and send back the data
async function loadPlayerData(userId: string) {
	// Request data load
	await unityService.loadFromSupabase('player_data', { userId });

	// Listen for the loaded data
	const unsub = unityService.on(UnityEventType.DATA_LOADED, (event) => {
		console.log('Player data loaded:', event.data);
		unsub(); // Clean up after receiving
	});
}
```

#### Save Data to Supabase (via Unity)

```typescript
import { unityService } from '@/components/unity-react';
import type { PlayerData } from '@/components/unity-react/typeUnity';

async function savePlayerData(playerData: PlayerData) {
	await unityService.savePlayerData(playerData);

	// Listen for save confirmation
	const unsub = unityService.on(UnityEventType.DATA_SAVED, (event) => {
		console.log('Data saved:', event.data);
		unsub();
	});
}
```

### 5. Real-time Game State Sync

```typescript
import { useEffect, useState } from 'react';
import { unityService, UnityEventType } from '@/components/unity-react';

function PlayerHUD() {
  const [playerHealth, setPlayerHealth] = useState(100);
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    // Listen for player stats updates
    const unsubStats = unityService.on(UnityEventType.PLAYER_STATS_UPDATED, (event) => {
      const stats = event.data;
      setPlayerHealth(stats.health);
    });

    // Listen for player movement
    const unsubMove = unityService.on(UnityEventType.PLAYER_MOVED, (event) => {
      const pos = event.data.position;
      setPlayerPosition(pos);
    });

    return () => {
      unsubStats();
      unsubMove();
    };
  }, []);

  return (
    <div>
      <p>Health: {playerHealth}</p>
      <p>Position: ({playerPosition.x.toFixed(1)}, {playerPosition.y.toFixed(1)}, {playerPosition.z.toFixed(1)})</p>
    </div>
  );
}
```

### 6. Terrain Visualization

```typescript
import { useEffect, useState } from 'react';
import { unityService } from '@/components/unity-react';
import type { UnityArrayDataEvent, TerrainChunkMetadata } from '@/components/unity-react/typeUnity';

function TerrainMap() {
  const [chunks, setChunks] = useState<Map<string, Float32Array>>(new Map());

  useEffect(() => {
    // Listen for chunk metadata
    const unsubMeta = unityService.on('ChunkMetadata', (event) => {
      const meta = event.data as TerrainChunkMetadata;
      console.log(`Chunk (${meta.chunkX}, ${meta.chunkZ}) size: ${meta.width}x${meta.height}`);
    });

    // Listen for heightmap data
    const unsubHeightmap = unityService.onArrayData('ChunkHeightmap', (event: UnityArrayDataEvent) => {
      const heightmap = event.data as Float32Array;

      // Store in map (you'd parse metadata from event.type or separate event)
      setChunks((prev) => {
        const key = `chunk_${Date.now()}`; // Ideally use chunkX_chunkZ
        return new Map(prev).set(key, heightmap);
      });

      // Visualize with Canvas 2D or WebGL
      visualizeHeightmap(heightmap);
    });

    return () => {
      unsubMeta();
      unsubHeightmap();
    };
  }, []);

  const visualizeHeightmap = (heightmap: Float32Array) => {
    // Example: draw to canvas
    const canvas = document.getElementById('terrainCanvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = Math.sqrt(heightmap.length);
    canvas.width = size;
    canvas.height = size;

    const imageData = ctx.createImageData(size, size);

    for (let i = 0; i < heightmap.length; i++) {
      const height = heightmap[i];
      const brightness = Math.floor((height / 100) * 255); // Normalize to 0-255

      imageData.data[i * 4] = brightness; // R
      imageData.data[i * 4 + 1] = brightness; // G
      imageData.data[i * 4 + 2] = brightness; // B
      imageData.data[i * 4 + 3] = 255; // A
    }

    ctx.putImageData(imageData, 0, 0);
  };

  return (
    <div>
      <canvas id="terrainCanvas" width={256} height={256}></canvas>
      <p>Chunks loaded: {chunks.size}</p>
    </div>
  );
}
```

## Event Types Reference

All event types are defined in `UnityEventType` enum:

### Game Lifecycle

- `GAME_LOADED` - Game has loaded
- `GAME_READY` - Game is ready to play
- `GAME_PAUSED` - Game paused
- `GAME_RESUMED` - Game resumed
- `GAME_OVER` - Game over
- `LEVEL_STARTED` - Level started
- `LEVEL_COMPLETED` - Level completed

### Player Events

- `PLAYER_SPAWNED` - Player spawned
- `PLAYER_DIED` - Player died
- `PLAYER_RESPAWNED` - Player respawned
- `PLAYER_MOVED` - Player moved
- `PLAYER_STATS_UPDATED` - Player stats updated
- `PLAYER_INVENTORY_UPDATED` - Inventory updated

### Entity Events

- `ENTITY_SPAWNED` - Entity spawned
- `ENTITY_DESTROYED` - Entity destroyed
- `ENTITY_UPDATED` - Entity updated

### Terrain Events

- `CHUNK_LOADED` - Terrain chunk loaded
- `CHUNK_UNLOADED` - Terrain chunk unloaded
- `TERRAIN_GENERATED` - Terrain generated

### Progress Events

- `SCORE_UPDATED` - Score updated
- `ACHIEVEMENT_UNLOCKED` - Achievement unlocked
- `PROGRESS_UPDATED` - Progress updated

### Data Persistence

- `DATA_SAVE_REQUEST` - Data save requested
- `DATA_LOAD_REQUEST` - Data load requested
- `DATA_SAVED` - Data saved confirmation
- `DATA_LOADED` - Data loaded

### Errors

- `ERROR` - Error occurred
- `WARNING` - Warning

## Type Definitions

All types match the Unity C# data structures:

```typescript
// Vector3Data - matches Unity's Vector3
interface Vector3Data {
	x: number;
	y: number;
	z: number;
}

// QuaternionData - matches Unity's Quaternion
interface QuaternionData {
	x: number;
	y: number;
	z: number;
	w: number;
}

// PlayerData - matches Unity's PlayerData
interface PlayerData {
	playerId: string;
	playerName: string;
	level: number;
	experience: number;
	health: number;
	maxHealth: number;
	position?: Vector3Data;
	inventory?: string[];
	stats?: Record<string, number>;
}

// ChunkEvent - matches Unity's ChunkEvent
interface ChunkEvent {
	chunkX: number;
	chunkZ: number;
	isLoaded: boolean;
	vertexCount?: number;
	generationTime?: number;
}

// And many more in typeUnity.ts
```

## Best Practices

### 1. Always Unsubscribe

```typescript
useEffect(() => {
	const unsub = unityService.on('SomeEvent', handler);
	return () => unsub(); // Cleanup
}, []);
```

### 2. Type Your Event Data

```typescript
import type { PlayerSpawnEvent } from '@/components/unity-react/typeUnity';

unityService.on(UnityEventType.PLAYER_SPAWNED, (event) => {
	const data = event.data as PlayerSpawnEvent;
	// Now TypeScript knows the structure
});
```

### 3. Handle Large Data with Typed Arrays

For large datasets (>1MB), use typed arrays instead of JSON:

```typescript
// Unity sends: BufferBridge.SendFloatArray("HeightmapData", heightmap);

// JavaScript receives:
unityService.onArrayData('HeightmapData', (event) => {
	const heightmap = event.data as Float32Array;
	// Much faster than JSON for large arrays
});
```

### 4. Use Window Event Listeners for jslib Events

The `unityService` automatically sets up window listeners for:

- `UnityMessage` - JSON messages from Unity
- `UnityArrayData` - Typed array data from Unity
- `UnityError` - Error messages from Unity

These are dispatched by `WebGLBridge.jslib` and automatically handled.

## Debugging

### Enable Verbose Logging

The service logs all important events to the console:

```
[UnityService] Window event listeners initialized
[UnityService] Received UnityMessage: PlayerSpawned {...}
[UnityService] Received UnityArrayData: TerrainData_Heightmap Float32Array 6400
```

### Check Unity Context

```typescript
if (!unityService.isReady()) {
	console.warn('Unity not ready yet');
}
```

### Monitor All Events

```typescript
unityService.on('*', (event) => {
	console.log('[Unity Event]', event.type, event.data);
});
```

## Integration with Three.js

Example of using received mesh data with Three.js:

```typescript
import * as THREE from 'three';
import { unityService } from '@/components/unity-react';

// Listen for mesh data
const metadata = { vertexCount: 0, triangleCount: 0 };

unityService.on('MeshData_Metadata', (event) => {
	Object.assign(metadata, event.data);
});

unityService.onArrayData('MeshData_Vertices', (event) => {
	const vertices = event.data as Float32Array;

	unityService.onArrayData('MeshData_Triangles', (triangleEvent) => {
		const triangles = triangleEvent.data as Int32Array;

		// Create Three.js geometry
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			'position',
			new THREE.BufferAttribute(vertices, 3),
		);
		geometry.setIndex(new THREE.BufferAttribute(triangles, 1));
		geometry.computeVertexNormals();

		const material = new THREE.MeshStandardMaterial();
		const mesh = new THREE.Mesh(geometry, material);

		// Add to scene
		scene.add(mesh);
	});
});
```

## Next Steps

1. Check Unity side documentation: `/unity/bugwars/Assets/Scripts/JavaScriptBridge/README.md`
2. See example implementations in `ExampleUsage.cs`
3. Configure your Unity build settings for WebGL
4. Test in both Unity Editor and WebGL build

## Support

For issues or questions:

- Check browser console for errors
- Verify Unity WebGL build is properly configured
- Ensure `WebGLBridge` GameObject exists in Unity scene
- Verify all files are served correctly by your web server
