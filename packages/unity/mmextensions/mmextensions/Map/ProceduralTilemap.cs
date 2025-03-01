using System;
using System.Collections;
using System.Collections.Generic;
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
    private bool _isChunkGenerationActive = false;

    [Header("Extended Settings")]
    [Tooltip("Enable debug logs for generation steps.")]
    public bool EnableDebugLogs = false;

    [Tooltip("Additional prefabs to spawn during generation.")]
    public List<SpawnData> AdditionalPrefabsToSpawn;

    [Tooltip("Custom logic to handle tilemap decorations.")]
    public Tilemap DecorationsTilemap;

    protected override void Awake()
    {
      base.Awake();
      _generatedChunks = new Dictionary<Vector2Int, bool>();
      _filledPositions = new List<Vector3>();
    }

    public override void Generate()
    {
      if (EnableDebugLogs)
      {
        Debug.Log("[ProceduralTilemap] Starting generation...");
      }

      base.Generate();
      HandleDecorations();
      SpawnAdditionalPrefabs();

      if (EnableDebugLogs)
      {
        Debug.Log("[ProceduralTilemap] Generation complete.");
      }
    }

    protected virtual void HandleDecorations()
    {
      if (DecorationsTilemap == null || ObstaclesTilemap == null)
      {
        if (EnableDebugLogs)
        {
          Debug.LogWarning(
            "[ProceduralTilemap] DecorationsTilemap or ObstaclesTilemap is not set."
          );
        }
        return;
      }

      if (EnableDebugLogs)
      {
        Debug.Log("[ProceduralTilemap] Adding decorations...");
      }

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

    protected virtual void SpawnAdditionalPrefabs()
    {
      if (AdditionalPrefabsToSpawn == null || AdditionalPrefabsToSpawn.Count == 0)
      {
        return;
      }

      if (EnableDebugLogs)
      {
        Debug.Log("[ProceduralTilemap] Spawning additional prefabs...");
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

    protected override void HandleWallsShadow()
    {
      base.HandleWallsShadow();

      if (EnableDebugLogs)
      {
        Debug.Log("[ProceduralTilemap] Custom shadow handling can be added here.");
      }
    }

    protected virtual void OnEnable()
    {
      this.MMEventStartListening<TopDownEngineEvent>();
    }

    protected virtual void OnDisable()
    {
      this.MMEventStopListening<TopDownEngineEvent>();
    }

    public virtual void OnMMEvent(TopDownEngineEvent topDownEngineEvent)
    {
      switch (topDownEngineEvent.EventType)
      {
        case TopDownEngineEventTypes.SpawnComplete:
          if (_isChunkGenerationActive)
            return;

          _playerTransform = topDownEngineEvent.OriginCharacter?.transform;
          Debug.Log("[ChunkedTilemapLevelGenerator] Player transform assigned.");

          StartChunkGenerationLoop().Forget();
          _isChunkGenerationActive = true;
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

    private async UniTaskVoid StartChunkGenerationLoop()
    {
      while (_playerTransform == null)
      {
        Debug.LogWarning("[ChunkedTilemapLevelGenerator] Waiting for player transform...");
        await UniTask.Yield();
      }

      Debug.Log(
        "[ChunkedTilemapLevelGenerator] Player transform found. Starting chunk generation."
      );

      while (true)
      {
        Vector2Int currentChunk = GetChunkPosition(_playerTransform.position);
        await GenerateChunksAround(currentChunk);
        UnloadDistantChunks(currentChunk);
        await UniTask.Yield();
      }
    }

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
        _generatedChunks.Remove(chunk);
        Debug.Log($"[ChunkedTilemapLevelGenerator] Unloaded chunk at {chunk}");
      }
    }

    private async UniTask GenerateChunksAround(Vector2Int centerChunk)
    {
      Queue<Vector2Int> queue = new Queue<Vector2Int>();
      HashSet<Vector2Int> visited = new HashSet<Vector2Int>();

      queue.Enqueue(centerChunk);
      visited.Add(centerChunk);

      while (queue.Count > 0)
      {
        Vector2Int chunkPosition = queue.Dequeue();

        if (!_generatedChunks.ContainsKey(chunkPosition))
        {
          await GenerateChunk(chunkPosition);
          _generatedChunks[chunkPosition] = true;

          if (EnableDebugLogs)
          {
            Debug.Log($"[ChunkedTilemapLevelGenerator] Generated chunk at {chunkPosition}");
          }
        }

        foreach (
          Vector2Int direction in new[]
          {
            Vector2Int.up,
            Vector2Int.down,
            Vector2Int.left,
            Vector2Int.right
          }
        )
        {
          Vector2Int neighbor = chunkPosition + direction;

          if (
            !visited.Contains(neighbor)
            && Vector2Int.Distance(centerChunk, neighbor) <= MaxActiveChunks
          )
          {
            queue.Enqueue(neighbor);
            visited.Add(neighbor);
          }
        }
      }
    }

    private async UniTask GenerateChunk(Vector2Int chunkPosition)
    {
      BoundsInt chunkBounds = new BoundsInt(
        chunkPosition.x * ChunkWidth,
        chunkPosition.y * ChunkHeight,
        0,
        ChunkWidth,
        ChunkHeight,
        1
      );
      await GenerateChunkTiles(chunkBounds);
      await SpawnPrefabsInChunk(chunkBounds);
      await UniTask.Yield();
    }

    private async UniTask GenerateChunkTiles(BoundsInt chunkBounds)
    {
      foreach (var position in chunkBounds.allPositionsWithin)
      {
        if (UnityEngine.Random.value > 0.8f)
        {
          TileBase tile = ObstaclesTilemap.GetTile(position);
          if (tile != null)
          {
            ObstaclesTilemap.SetTile(position, tile);
          }
        }
      }

      await UniTask.Yield();
    }

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
            spawnPosition = new Vector3(
              UnityEngine.Random.Range(chunkBounds.xMin, chunkBounds.xMax),
              UnityEngine.Random.Range(chunkBounds.yMin, chunkBounds.yMax),
              0
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

      await UniTask.Yield();
    }
  }
}
