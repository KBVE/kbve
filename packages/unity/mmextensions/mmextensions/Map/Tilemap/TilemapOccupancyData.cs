using UnityEngine;

namespace KBVE.MMExtensions.Map
{
    [CreateAssetMenu(menuName = "KBVE/Map/Tilemap Occupancy Map")]
    public class TilemapOccupancyData : ScriptableObject
    {
        public Vector2Int size;
        public bool[] data;

        public bool Get(int x, int y)
        {
            if (data == null || x < 0 || y < 0 || x >= size.x || y >= size.y)
                return false;

            return data[y * size.x + x];
        }

        public void Set(int x, int y, bool value)
        {
            if (data == null || x < 0 || y < 0 || x >= size.x || y >= size.y)
                return;

            data[y * size.x + x] = value;
        }
    }
}
