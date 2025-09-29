using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class PathfindingInitSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<MapSettings>();
        }

        protected override void OnUpdate()
        {
            if (SystemAPI.TryGetSingleton<PathfindingConfig>(out _))
            {
                Enabled = false;
                return;
            }

            var mapSettings = SystemAPI.GetSingleton<MapSettings>();

            var config = PathfindingConfig.Default;
            config.maxCachedFlowFields = mapSettings.zonesPerAxis * 3;
            config.flowFieldCellSize = mapSettings.mapSize / (mapSettings.zonesPerAxis * 50f);
            EntityManager.CreateSingleton(config);

            var sectorNav = new SectorNavigationData
            {
                sectorsPerAxis = mapSettings.zonesPerAxis,
                sectorSize = mapSettings.mapSize / mapSettings.zonesPerAxis,
                mapOrigin = new float3(-mapSettings.mapSize * 0.5f, -mapSettings.mapSize * 0.5f, 0)
            };
            EntityManager.CreateSingleton(sectorNav);

            EntityManager.CreateSingleton<PathfindingStats>();

            Debug.Log($"[Pathfinding] Initialized: {sectorNav.sectorsPerAxis}x{sectorNav.sectorsPerAxis} sectors, cache size: {config.maxCachedFlowFields}");

            Enabled = false;
        }
    }
}