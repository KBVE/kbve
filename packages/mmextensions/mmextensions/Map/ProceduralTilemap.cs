using System;
using System.Collections;
using System.Collections.Generic;
//  [Crash]
using Cysharp.Threading.Tasks;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.Tilemaps;

namespace KBVE.MMExtensions.Map
{
  public class KBVETilemapLevelGenerator
    : TilemapLevelGenerator,
      MMEventListener<TopDownEngineEvent>
  {
    [Header("Chunk Settings")]
    [Tooltip("Width of each chunk in tiles.")]
    public int ChunkWidth = 10;

    [Tooltip("Height of each chunk in tiles.")]
    public int ChunkHeight = 10;

    [Tooltip("Maximum chunks to render around the player.")]
    public int MaxActiveChunks = 5;

    [Tooltip("Time (in milliseconds) to wait between generating chunks.")]
    public double ChunkGenerationDelay = 50;

    private Dictionary<Vector2Int, bool> _generatedChunks;
    private Transform _playerTransform;
    private List<Vector3> _filledPositions;

    [Header("Extended Settings")]
    [Tooltip("Enable debug logs for generation steps.")]
    public bool EnableDebugLogs = false;

    [Tooltip("Additional prefabs to spawn during generation.")]
    public List<SpawnData> AdditionalPrefabsToSpawn;

    [Tooltip("Custom logic to handle tilemap decorations.")]
    public Tilemap DecorationsTilemap;

    /// <summary>
    /// On Awake, set up chunk tracking and filled positions.
    /// </summary>
    protected override void Awake()
    {
      base.Awake();
      _generatedChunks = new Dictionary<Vector2Int, bool>();
      _filledPositions = new List<Vector3>();
    }

    /// <summary>
    /// Overrides the Generate method to add custom functionality after base generation.
    /// </summary>
    public override void Generate()
    {
      if (EnableDebugLogs)
      {
        Debug.Log("[ExtendedTilemapLevelGenerator] Starting generation...");
      }

      base.Generate();
      HandleDecorations();
      SpawnAdditionalPrefabs();

      if (EnableDebugLogs)
      {
        Debug.Log("[ExtendedTilemapLevelGenerator] Generation complete.");
      }
    }

    /// <summary>
    /// Handles adding decorations to the tilemap.
    /// </summary>
    protected virtual void HandleDecorations()
    {
      if (DecorationsTilemap == null || ObstaclesTilemap == null)
      {
        if (EnableDebugLogs)
        {
          Debug.LogWarning(
            "[ExtendedTilemapLevelGenerator] DecorationsTilemap or ObstaclesTilemap is not set."
          );
        }
        return;
      }

      if (EnableDebugLogs)
      {
        Debug.Log("[ExtendedTilemapLevelGenerator] Adding decorations...");
      }

      // Example: Copy some tiles from ObstaclesTilemap to DecorationsTilemap
      BoundsInt bounds = ObstaclesTilemap.cellBounds;
      foreach (var position in bounds.allPositionsWithin)
      {
        TileBase tile = ObstaclesTilemap.GetTile(position);
        if (tile != null && UnityEngine.Random.value > 0.8f) // 20% chance to add decoration
        {
          DecorationsTilemap.SetTile(position, tile);
        }
      }
    }

    /// <summary>
    /// Spawns additional prefabs defined in AdditionalPrefabsToSpawn.
    /// </summary>
    protected virtual void SpawnAdditionalPrefabs()
    {
      if (AdditionalPrefabsToSpawn == null || AdditionalPrefabsToSpawn.Count == 0)
      {
        return;
      }

      if (EnableDebugLogs)
      {
        Debug.Log("[ExtendedTilemapLevelGenerator] Spawning additional prefabs...");
      }

      foreach (var data in AdditionalPrefabsToSpawn)
      {
        for (int i = 0; i < data.Quantity; i++)
        {
          Vector3 spawnPosition = Vector3.zero;
          bool validPosition = false;
          int iterations = 0;

          while (!validPosition && iterations < _maxIterationsCount)
          {
            spawnPosition = MMTilemap.GetRandomPosition(
              ObstaclesTilemap,
              TargetGrid,
              GridWidth.x,
              GridHeight.x,
              false,
              _maxIterationsCount
            );
            validPosition = true;

            foreach (Vector3 filledPosition in _filledPositions)
            {
              if (Vector3.Distance(spawnPosition, filledPosition) < PrefabsSpawnMinDistance)
              {
                validPosition = false;
                break;
              }
            }

            iterations++;
          }

          if (validPosition)
          {
            Instantiate(data.Prefab, spawnPosition, Quaternion.identity);
            _filledPositions.Add(spawnPosition);
          }
        }
      }
    }

    /// <summary>
    /// Optional: Add more customization by overriding other methods or introducing new ones.
    /// </summary>
    protected override void HandleWallsShadow()
    {
      base.HandleWallsShadow();

      if (EnableDebugLogs)
      {
        Debug.Log("[ExtendedTilemapLevelGenerator] Custom shadow handling can be added here.");
      }
    }

    //  [CRASH - Event Listener
    protected virtual void OnEnable()
    {
      // base.OnEnable();
      MMEventStartListening<TopDownEngineEvent>();
    }

    protected virtual void OnDisable()
    {
      // base.OnDisable();
      MMEventStopListening<TopDownEngineEvent>();
    }

    /// <summary>
    /// Handles TopDownEngine events.
    /// </summary>
    /// <param name="topDownEngineEvent">The event data.</param>
    public virtual void OnMMEvent(TopDownEngineEvent topDownEngineEvent)
    {
      switch (topDownEngineEvent.EventType)
      {
        case TopDownEngineEventTypes.SpawnComplete:
          _playerTransform = topDownEngineEvent.Origin?.transform;
          Debug.Log("[ChunkedTilemapLevelGenerator] Player transform assigned.");
          break;

        default:
          if (EnableDebugLogs)
          {
            Debug.Log(
              $"[ChunkedTilemapLevelGenerator] Unhandled event type: {topDownEngineEvent.EventType}"
            );
          }
          break;
      }
    }

    /// <summary>
    /// Main loop to generate chunks dynamically as the player moves.
    /// </summary>
    private async UniTaskVoid StartChunkGenerationLoop()
    {
      // Wait until _playerTransform is assigned
      while (_playerTransform == null)
      {
        Debug.LogWarning("[ChunkedTilemapLevelGenerator] Waiting for player transform...");
        await UniTask.Delay(TimeSpan.FromMilliseconds(100)); // Poll every 100ms to check if _playerTransform is set
      }

      Debug.Log(
        "[ChunkedTilemapLevelGenerator] Player transform found. Starting chunk generation."
      );

      // Main chunk generation loop
      while (true)
      {
        Vector2Int currentChunk = GetChunkPosition(_playerTransform.position);
        await GenerateChunksAround(currentChunk);
        UnloadDistantChunks(currentChunk);
        await UniTask.Delay(TimeSpan.FromMilliseconds(100)); // Small delay to avoid performance spikes
      }
    }

    /// <summary>
    /// Determines the chunk position for a given world position.
    /// </summary>
    private Vector2Int GetChunkPosition(Vector3 worldPosition)
    {
      int chunkX = Mathf.FloorToInt(worldPosition.x / ChunkWidth);
      int chunkY = Mathf.FloorToInt(worldPosition.y / ChunkHeight);
      return new Vector2Int(chunkX, chunkY);
    }

    private void UnloadDistantChunks(Vector2Int centerChunk)
    {
      List<Vector2Int> chunksToUnload = new List<Vector2Int>();

      foreach (var chunk in _generatedChunks.Keys)
      {
        if (Vector2Int.Distance(chunk, centerChunk) > MaxActiveChunks)
        {
          chunksToUnload.Add(chunk);
        }
      }

      foreach (var chunk in chunksToUnload)
      {
        // Optionally clear the tilemap or destroy prefab instances
        _generatedChunks.Remove(chunk);
        Debug.Log($"[ChunkedTilemapLevelGenerator] Unloaded chunk at {chunk}");
      }
    }

    /// <summary>
    /// Generates chunks around the given center chunk asynchronously.
    /// </summary>
    /// <param name="centerChunk">The center chunk based on the player's current position.</param>
    private async UniTask GenerateChunksAround(Vector2Int centerChunk)
    {
      // Loop through the chunks within the active radius
      for (int x = -MaxActiveChunks; x <= MaxActiveChunks; x++)
      {
        for (int y = -MaxActiveChunks; y <= MaxActiveChunks; y++)
        {
          Vector2Int chunkPosition = new Vector2Int(centerChunk.x + x, centerChunk.y + y);

          // Check if the chunk has already been generated
          if (_generatedChunks.ContainsKey(chunkPosition))
          {
            continue;
          }

          // Generate the chunk and mark it as generated
          await GenerateChunk(chunkPosition);
          _generatedChunks[chunkPosition] = true;

          if (EnableDebugLogs)
          {
            Debug.Log($"[ChunkedTilemapLevelGenerator] Generated chunk at {chunkPosition}");
          }
        }
      }
    }

    /// <summary>
    /// Generates a single chunk asynchronously.
    /// </summary>
    /// <param name="chunkPosition">The chunk position to generate.</param>
    private async UniTask GenerateChunk(Vector2Int chunkPosition)
    {
      // Define the bounds of the chunk
      BoundsInt chunkBounds = new BoundsInt(
        chunkPosition.x * ChunkWidth,
        chunkPosition.y * ChunkHeight,
        0,
        ChunkWidth,
        ChunkHeight,
        1
      );

      // Generate tiles for the chunk
      await GenerateChunkTiles(chunkBounds);

      // Optionally spawn prefabs in the chunk
      await SpawnPrefabsInChunk(chunkBounds);

      await UniTask.Delay(TimeSpan.FromMilliseconds(ChunkGenerationDelay)); // Delay to avoid performance spikes
    }

    /// <summary>
    /// Generates tiles within the given chunk bounds.
    /// </summary>
    /// <param name="chunkBounds">The bounds of the chunk.</param>
    private async UniTask GenerateChunkTiles(BoundsInt chunkBounds)
    {
      foreach (var position in chunkBounds.allPositionsWithin)
      {
        if (UnityEngine.Random.value > 0.8f) // Example: Randomly place tiles
        {
          TileBase tile = ObstaclesTilemap.GetTile(position); // Retrieve a sample tile
          if (tile != null)
          {
            ObstaclesTilemap.SetTile(position, tile);
          }
        }
      }

      await UniTask.Yield(); // Yield control to maintain performance
    }

    // NOT READY - JUST ADDED

    /// <summary>
    /// Spawns prefabs within the given chunk bounds asynchronously.
    /// </summary>
    /// <param name="chunkBounds">The bounds of the chunk.</param>
    private async UniTask SpawnPrefabsInChunk(BoundsInt chunkBounds)
    {
      foreach (var data in AdditionalPrefabsToSpawn)
      {
        for (int i = 0; i < data.Quantity; i++)
        {
          Vector3 spawnPosition = Vector3.zero;
          bool validPosition = false;
          int iterations = 0;

          while (!validPosition && iterations < _maxIterationsCount)
          {
            // Generate a random position within the chunk bounds
            spawnPosition = new Vector3(
              UnityEngine.Random.Range(chunkBounds.xMin, chunkBounds.xMax),
              UnityEngine.Random.Range(chunkBounds.yMin, chunkBounds.yMax),
              0
            );

            validPosition = true;

            // Ensure the position isn't too close to existing positions
            foreach (Vector3 filledPosition in _filledPositions)
            {
              if (Vector3.Distance(spawnPosition, filledPosition) < PrefabsSpawnMinDistance)
              {
                validPosition = false;
                break;
              }
            }

            iterations++;
          }

          if (validPosition)
          {
            Instantiate(data.Prefab, spawnPosition, Quaternion.identity);
            _filledPositions.Add(spawnPosition);
          }
        }
      }

      await UniTask.Yield(); // Yield control for performance
    }
  }
}
