using UnityEngine;
using UnityEngine.Tilemaps;
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
        public Tilemap targetTilemap;
        public Vector3Int size = new Vector3Int(10, 10, 1);
        public TilemapOccupancyData outputData;

        public void Bake()
        {
            if (targetTilemap == null)
            {
                Debug.LogError("[TilemapOccupancyBaker] No Tilemap assigned.");
                return;
            }

#if UNITY_EDITOR
            if (outputData == null)
            {
                string sceneName = gameObject.scene.name;
                string objectName = gameObject.name;
                string fileName = $"{sceneName}_{objectName}_occupancy.asset";

                string folderPath = "Assets/Data/OccupancyMaps";
                if (!AssetDatabase.IsValidFolder(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                    AssetDatabase.Refresh();
                }

                outputData = ScriptableObject.CreateInstance<TilemapOccupancyData>();
                string fullPath = Path.Combine(folderPath, fileName);
                AssetDatabase.CreateAsset(outputData, fullPath);
                AssetDatabase.SaveAssets();

                Debug.Log($"[TilemapOccupancyBaker] Created new asset: {fullPath}");
            }
#endif

            outputData.size = new Vector2Int(size.x, size.y);
            outputData.data = new bool[size.x * size.y];

            BoundsInt bounds = new BoundsInt(
                targetTilemap.origin.x, targetTilemap.origin.y, 0,
                size.x, size.y, 1
            );

            for (int x = 0; x < size.x; x++)
            {
                for (int y = 0; y < size.y; y++)
                {
                    Vector3Int pos = new Vector3Int(bounds.x + x, bounds.y + y, 0);
                    TileBase tile = targetTilemap.GetTile(pos);
                    outputData.Set(x, y, tile != null);
                }
            }

#if UNITY_EDITOR
            EditorUtility.SetDirty(outputData);
            AssetDatabase.SaveAssets();
#endif

            Debug.Log("[TilemapOccupancyBaker] Bake complete.");
        }

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            if (outputData == null || outputData.data == null || targetTilemap == null) return;

            Gizmos.color = Color.red;
            Vector3 cellSize = targetTilemap.cellSize;

            for (int x = 0; x < outputData.size.x; x++)
            {
                for (int y = 0; y < outputData.size.y; y++)
                {
                    if (outputData.Get(x, y))
                    {
                        Vector3Int cell = new Vector3Int(targetTilemap.origin.x + x, targetTilemap.origin.y + y, 0);
                        Vector3 world = targetTilemap.CellToWorld(cell) + cellSize / 2;
                        Gizmos.DrawWireCube(world, cellSize * 0.9f);
                    }
                }
            }
        }
#endif
    }
}
