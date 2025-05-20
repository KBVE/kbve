using UnityEngine;

namespace KBVE.MMExtensions.Map
{
    [CreateAssetMenu(menuName = "KBVE/Map/Tilemap Occupancy Map")]
    public class TilemapOccupancyData : ScriptableObject
    {
        public Vector2Int size;
        public bool[]? data;
        public bool Get(int x, int y) => data != null && y * size.x + x < data.Length && data[y * size.x + x];
        public void Set(int x, int y, bool value)
        {
            if (data != null && y * size.x + x < data.Length)
                data[y * size.x + x] = value;
        }

    }
}
    