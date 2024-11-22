using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.Tilemaps;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;

namespace KBVE.MMExtensions.Map 
{

    public class KBVETilemapLevelGenerator : TilemapLevelGenerator
    {
        [Header("Extended Settings")]
        [Tooltip("Enable debug logs for generation steps.")]
        public bool EnableDebugLogs = false;

        [Tooltip("Additional prefabs to spawn during generation.")]
        public List<SpawnData> AdditionalPrefabsToSpawn;

        [Tooltip("Custom logic to handle tilemap decorations.")]
        public Tilemap DecorationsTilemap;

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
                    Debug.LogWarning("[ExtendedTilemapLevelGenerator] DecorationsTilemap or ObstaclesTilemap is not set.");
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
                        spawnPosition = MMTilemap.GetRandomPosition(ObstaclesTilemap, TargetGrid, GridWidth.x, GridHeight.x, false, _maxIterationsCount);
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

    }

}