using Unity.Entities;
using Unity.Mathematics;


namespace KBVE.MMExtensions.Orchestrator.DOTS
{

    /// <summary>
    /// Settings for map generation
    /// </summary>
    public struct MapSettings : IComponentData
    {
        public float mapSize;                  // Total map size (e.g., 10000 units)

        public float2x2 size;
        public Entity rockCollectionLink;
        public int rockCount;
        public int zonesPerAxis;               // Number of zones per axis (e.g., 10x10 grid)
        public int hordeSpawnPointsPerZone;    // Spawn points per zone
        public float defaultPatrolRadius;      // Default patrol radius for hordes

        public static MapSettings CreateDefault()
        {
            return new MapSettings
            {
                mapSize = 5000f,               // 5000x5000 unit map
                zonesPerAxis = 10,             // 10x10 zones = 100 zones total
                hordeSpawnPointsPerZone = 10,  // 10 spawn points per zone = 1000 total
                defaultPatrolRadius = 150f     // 150 unit patrol radius
            };
        }
    }
}