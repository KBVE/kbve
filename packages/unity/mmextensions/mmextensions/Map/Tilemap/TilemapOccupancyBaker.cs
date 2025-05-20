using UnityEngine;
using UnityEngine.Tilemaps;
using System.Collections.Generic;
using System.IO;

#if UNITY_EDITOR
using UnityEditor;
#endif

namespace KBVE.MMExtensions.Map
{
    [ExecuteAlways]
    [DisallowMultipleComponent]
    [AddComponentMenu("KBVE/Map/Tilemap Occupancy Baker")]
    public class TilemapOccupancyBaker : MonoBehaviour
    {
        public Grid targetGrid;
        public bool useAutoBounds = true;

        [Tooltip("Only used if 'Use Auto Bounds' is disabled.")]
        public Vector3Int size = new Vector3Int(10, 10, 1);

        public Vector3Int originOffset = Vector3Int.zero;
        public Color gizmoColor = new Color(1f, 0f, 0f, 0.5f);
        public TilemapOccupancyData outputData;

        [Tooltip("Only tilemaps whose GameObject name is in this list will be included.")]
        public List<string> includeLayers = new() { "Collision", "Ground" };

        [ContextMenu("Bake Tile Occupancy")]
        public void Bake()
        {
            if (targetGrid == null)
            {
                Debug.LogError("[TilemapOccupancyBaker] No Grid assigned.");
                return;
            }

            var tilemaps = targetGrid.GetComponentsInChildren<Tilemap>();
            if (tilemaps.Length == 0)
            {
                Debug.LogWarning("[TilemapOccupancyBaker] No Tilemaps found.");
                return;
            }

#if UNITY_EDITOR
            if (outputData == null)
            {
                string sceneName = gameObject.scene.name;
                string objectName = gameObject.name;
                string folderPath = "Assets/Data/OccupancyMaps";

                if (!AssetDatabase.IsValidFolder("Assets/Data"))
                    AssetDatabase.CreateFolder("Assets", "Data");
                if (!AssetDatabase.IsValidFolder(folderPath))
                    AssetDatabase.CreateFolder("Assets/Data", "OccupancyMaps");

                string fileName = $"{sceneName}_{objectName}_occupancy.asset";
                string fullPath = Path.Combine(folderPath, fileName);

                if (File.Exists(fullPath))
                {
                    string timestamp = System.DateTime.Now.ToString("yyyyMMdd_HHmmss");
                    fileName = $"{sceneName}_{objectName}_occupancy_{timestamp}.asset";
                    fullPath = Path.Combine(folderPath, fileName);
                }

                outputData = ScriptableObject.CreateInstance<TilemapOccupancyData>();
                AssetDatabase.CreateAsset(outputData, fullPath);
                AssetDatabase.SaveAssets();

                Debug.Log($"[TilemapOccupancyBaker] Created new asset: {fullPath}");
            }
#endif

            BoundsInt bounds = new(Vector3Int.zero, size); // fallback

            foreach (var tilemap in tilemaps)
            {
                if (includeLayers.Count > 0 && !includeLayers.Contains(tilemap.gameObject.name))
                    continue;

                bounds = tilemap.cellBounds;
                bounds.position += originOffset;
                break;
            }

            outputData.size = new Vector2Int(bounds.size.x, bounds.size.y);
            outputData.data = new bool[bounds.size.x * bounds.size.y];

            int tileCount = 0;

            foreach (var tilemap in tilemaps)
            {
                if (includeLayers.Count > 0 && !includeLayers.Contains(tilemap.gameObject.name))
                    continue;

                for (int x = 0; x < bounds.size.x; x++)
                {
                    for (int y = 0; y < bounds.size.y; y++)
                    {
                        Vector3Int pos = new(bounds.x + x, bounds.y + y, 0);
                        TileBase tile = tilemap.GetTile(pos);
                        if (tile != null)
                        {
                            outputData.Set(x, y, true);
                            tileCount++;
                        }
                    }
                }
            }

#if UNITY_EDITOR
            EditorUtility.SetDirty(outputData);
            AssetDatabase.SaveAssets();
#endif

            Debug.Log($"[TilemapOccupancyBaker] Bake complete. Marked {tileCount} tiles.");
        }

#if UNITY_EDITOR
        [ContextMenu("Log Occupancy Grid")]
        public void LogOccupancy()
        {
            if (outputData == null || outputData.data == null) return;

            Debug.Log($"[TilemapOccupancyBaker] Occupancy Grid for {gameObject.name}:");
            for (int y = outputData.size.y - 1; y >= 0; y--)
            {
                string row = "";
                for (int x = 0; x < outputData.size.x; x++)
                {
                    row += outputData.Get(x, y) ? "■" : "·";
                }
                Debug.Log(row);
            }
        }

        private void OnDrawGizmosSelected()
        {
            if (outputData == null || outputData.data == null || targetGrid == null) return;

            Gizmos.color = gizmoColor;
            Vector3 cellSize = Vector3.one;

            foreach (var tilemap in targetGrid.GetComponentsInChildren<Tilemap>())
            {
                if (includeLayers.Count == 0 || includeLayers.Contains(tilemap.gameObject.name))
                {
                    cellSize = tilemap.cellSize;
                    break;
                }
            }

            for (int x = 0; x < outputData.size.x; x++)
            {
                for (int y = 0; y < outputData.size.y; y++)
                {
                    if (outputData.Get(x, y))
                    {
                        Vector3Int cell = new Vector3Int(
                            originOffset.x + x,
                            originOffset.y + y,
                            0
                        );
                        Vector3 world = targetGrid.CellToWorld(cell) + cellSize / 2;
                        Gizmos.DrawWireCube(world, cellSize * 0.9f);
                    }
                }
            }
        }
#endif
    }
}
