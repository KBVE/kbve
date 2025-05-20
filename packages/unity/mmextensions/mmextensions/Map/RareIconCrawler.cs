using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Tilemaps;


namespace KBVE.MMExtensions.Map
{
    public class RareIconCrawler : MonoBehaviour
    {
        [Header("Dungeon Entrances")]
        public Transform northEntry;
        public Transform southEntry;
        public Transform eastEntry;
        public Transform westEntry;

        [Header("Grid Root")]
        public Grid grid;

        [Header("Tilemap Layers")]
        public Tilemap groundTilemap;
        public Tilemap wallTilemap;

        [Header("Tile Assets")]
        public TileBase groundTile;
        public TileBase wallTile;

        [Header("World Generation Settings")]
        public Vector2Int roomSize = new(10, 10);
        public int hallwayLength = 5;
        public int hallwayCorridor = 7;
        public int worldRadius = 3;

        private Dictionary<Vector3Int, Vector3Int> placedRooms = new();

        private void Start()
        {
            TryGenerateCorridorAndRoom(northEntry, Vector3Int.up);
            TryGenerateCorridorAndRoom(southEntry, Vector3Int.down);
            TryGenerateCorridorAndRoom(eastEntry, Vector3Int.right);
            TryGenerateCorridorAndRoom(westEntry, Vector3Int.left);
        }

        private void TryGenerateCorridorAndRoom(Transform entry, Vector3Int dir)
        {
            if (entry == null)
                return;

            Vector3Int start = groundTilemap.WorldToCell(entry.position);
            Vector3Int end = start + dir * hallwayLength;

            CarveCorridor(start, end, dir);

            Vector3Int roomOrigin = GetAlignedRoomOrigin(end, dir);

            if (!IsRoomAreaClear(roomOrigin))
            {
                Debug.LogWarning($"Room blocked in direction {dir}. Skipping room.");
                return;
            }

            AddRoomAt(roomOrigin);
            CarveDoorway(GetRoomWallPosition(roomOrigin, dir), dir);

            placedRooms[roomOrigin] = dir;
            SpawnRoomAnchor(end, dir);
        }

        private void CarveCorridor(Vector3Int from, Vector3Int to, Vector3Int dir)
        {
            Vector3Int perp = new(-dir.y, dir.x, 0);
            Vector3Int current = from;

            for (int i = 0; i <= (to - from).magnitude; i++)
            {
                for (int w = -hallwayCorridor / 2; w <= hallwayCorridor / 2; w++)
                {
                    Vector3Int pos = current + perp * w;
                    groundTilemap.SetTile(pos, groundTile);
                    if (Mathf.Abs(w) == hallwayCorridor / 2)
                        wallTilemap.SetTile(pos, wallTile);
                }
                current += dir;
            }
        }

        private void AddRoomAt(Vector3Int origin)
        {
            for (int x = 0; x < roomSize.x; x++)
                for (int y = 0; y < roomSize.y; y++)
                {
                    Vector3Int pos = origin + new Vector3Int(x, y, 0);
                    groundTilemap.SetTile(pos, groundTile);
                    bool isEdge = x == 0 || y == 0 || x == roomSize.x - 1 || y == roomSize.y - 1;
                    if (isEdge)
                        wallTilemap.SetTile(pos, wallTile);
                }
        }

        private void CarveDoorway(Vector3Int wallTile, Vector3Int dir)
        {
            Vector3Int perp = new(-dir.y, dir.x, 0);
            for (int i = -1; i <= 1; i++)
            {
                Vector3Int door = wallTile + perp * i;
                wallTilemap.SetTile(door, null);
            }
        }

        private Vector3Int GetAlignedRoomOrigin(Vector3Int corridorEnd, Vector3Int dir)
        {
            return dir switch
            {
                { x: > 0 } => corridorEnd + new Vector3Int(1, -roomSize.y / 2, 0),
                { x: < 0 } => corridorEnd + new Vector3Int(-roomSize.x, -roomSize.y / 2, 0),
                { y: > 0 } => corridorEnd + new Vector3Int(-roomSize.x / 2, 1, 0),
                { y: < 0 } => corridorEnd + new Vector3Int(-roomSize.x / 2, -roomSize.y, 0),
                _ => corridorEnd,
            };
        }

        private Vector3Int GetRoomWallPosition(Vector3Int roomOrigin, Vector3Int dir)
        {
            return dir switch
            {
                { x: > 0 } => roomOrigin + new Vector3Int(0, roomSize.y / 2, 0),
                { x: < 0 } => roomOrigin + new Vector3Int(roomSize.x - 1, roomSize.y / 2, 0),
                { y: > 0 } => roomOrigin + new Vector3Int(roomSize.x / 2, 0, 0),
                { y: < 0 } => roomOrigin + new Vector3Int(roomSize.x / 2, roomSize.y - 1, 0),
                _ => roomOrigin,
            };
        }

        private bool IsRoomAreaClear(Vector3Int origin)
        {
            for (int x = 0; x < roomSize.x; x++)
                for (int y = 0; y < roomSize.y; y++)
                {
                    Vector3Int pos = origin + new Vector3Int(x, y, 0);
                    if (groundTilemap.HasTile(pos) || wallTilemap.HasTile(pos))
                        return false;
                }
            return true;
        }

        private void SpawnRoomAnchor(Vector3Int position, Vector3Int direction)
        {
            GameObject anchorGO = new GameObject("RoomAnchor_" + direction);
            var anchor = anchorGO.AddComponent<RoomAnchor>();
            anchor.position = position;
            anchor.facing = direction;
        }
    }
}