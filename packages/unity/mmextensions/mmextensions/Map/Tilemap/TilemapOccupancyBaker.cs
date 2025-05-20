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
        public Vector3Int originOffset = Vector3Int.zero;
        public Color gizmoColor = new Color(1f, 0f, 0f, 0.5f);
        public TilemapOccupancyData outputData;

        [ContextMenu("Bake Tile Occupancy")]
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
                string folderPath = "Assets/Data/OccupancyMaps";

                if (!AssetDatabase.IsValidFolder("Assets/Data"))
                    AssetDatabase.CreateFolder("Assets", "Data");
                if (!AssetDatabase.IsValidFolder(folderPath))
                    AssetDatabase.CreateFolder("Assets/Data", "OccupancyMaps");

                string fileName = $"{sceneName}_{objectName}_occupancy.asset";
                string fullPath = Path.Combine(folderPath, fileName);

\               if (File.Exists(fullPath))
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

            outputData.size = new Vector2Int(size.x, size.y);
            outputData.data = new bool[size.x * size.y];

            BoundsInt bounds = new BoundsInt(
                targetTilemap.origin.x + originOffset.x,
                targetTilemap.origin.y + originOffset.y,
                0,
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
            if (outputData == null || outputData.data == null || targetTilemap == null) return;

            Gizmos.color = gizmoColor;
            Vector3 cellSize = targetTilemap.cellSize;

            for (int x = 0; x < outputData.size.x; x++)
            {
                for (int y = 0; y < outputData.size.y; y++)
                {
                    if (outputData.Get(x, y))
                    {
                        Vector3Int cell = new Vector3Int(
                            targetTilemap.origin.x + originOffset.x + x,
                            targetTilemap.origin.y + originOffset.y + y,
                            0
                        );
                        Vector3 world = targetTilemap.CellToWorld(cell) + cellSize / 2;
                        Gizmos.DrawWireCube(world, cellSize * 0.9f);
                    }
                }
            }
        }
#endif
    }
}
