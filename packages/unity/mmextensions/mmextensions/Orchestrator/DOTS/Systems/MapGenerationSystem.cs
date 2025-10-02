using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// System that generates and manages the map layout for zombie hordes
    /// Defines spawn zones, patrol areas, and movement boundaries
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [BurstCompile]
    public partial struct MapGenerationSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MapSettings>();
            state.RequireForUpdate<EndInitializationEntityCommandBufferSystem.Singleton>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Only run once
            state.Enabled = false;

            if (!SystemAPI.TryGetSingleton<MapSettings>(out var mapSettings))
                return;

            var ecb = SystemAPI.GetSingleton<EndInitializationEntityCommandBufferSystem.Singleton>()
                .CreateCommandBuffer(state.WorldUnmanaged);

            // Create map zones for horde distribution
            CreateMapZones(ref ecb, in mapSettings);

            // Create spawn points for hordes
            CreateHordeSpawnPoints(ref ecb, in mapSettings);
        }

        private static void CreateMapZones(ref EntityCommandBuffer ecb, in MapSettings mapSettings)
        {
            // Create zone entities that define different areas of the map
            int zonesPerAxis = mapSettings.zonesPerAxis;
            float zoneSize = mapSettings.mapSize / zonesPerAxis;

            for (int x = 0; x < zonesPerAxis; x++)
            {
                for (int y = 0; y < zonesPerAxis; y++)
                {
                    var zoneEntity = ecb.CreateEntity();

                    var zoneCenter = new float3(
                        (x - zonesPerAxis * 0.5f + 0.5f) * zoneSize,
                        (y - zonesPerAxis * 0.5f + 0.5f) * zoneSize,
                        0
                    );

                    ecb.AddComponent(zoneEntity, new MapZone
                    {
                        center = zoneCenter,
                        bounds = new float2(zoneSize, zoneSize),
                        zoneId = x * zonesPerAxis + y,
                        zoneType = GetZoneType(x, y, zonesPerAxis)
                    });

                    ecb.AddComponent(zoneEntity, new LocalTransform
                    {
                        Position = zoneCenter,
                        Rotation = quaternion.identity,
                        Scale = 1f
                    });
                }
            }
        }

        private static void CreateHordeSpawnPoints(ref EntityCommandBuffer ecb, in MapSettings mapSettings)
        {
            // Create predefined spawn points for hordes
            int spawnsPerZone = mapSettings.hordeSpawnPointsPerZone;
            int zonesPerAxis = mapSettings.zonesPerAxis;
            float zoneSize = mapSettings.mapSize / zonesPerAxis;

            for (int zoneX = 0; zoneX < zonesPerAxis; zoneX++)
            {
                for (int zoneY = 0; zoneY < zonesPerAxis; zoneY++)
                {
                    // Skip center zones to keep them clear
                    if (IsRestrictedZone(zoneX, zoneY, zonesPerAxis))
                        continue;

                    float3 zoneCenter = new float3(
                        (zoneX - zonesPerAxis * 0.5f + 0.5f) * zoneSize,
                        (zoneY - zonesPerAxis * 0.5f + 0.5f) * zoneSize,
                        0
                    );

                    // Create spawn points within this zone
                    for (int i = 0; i < spawnsPerZone; i++)
                    {
                        var spawnEntity = ecb.CreateEntity();

                        // Distribute spawn points within the zone
                        float2 offset = GetSpawnPointOffset(i, spawnsPerZone) * (zoneSize * 0.4f);
                        float3 spawnPos = zoneCenter + new float3(offset.x, offset.y, 1f);

                        ecb.AddComponent(spawnEntity, new HordeSpawnPoint
                        {
                            position = spawnPos,
                            patrolRadius = mapSettings.defaultPatrolRadius,
                            isOccupied = false,
                            spawnId = zoneX * zonesPerAxis * spawnsPerZone + zoneY * spawnsPerZone + i
                        });

                        ecb.AddComponent(spawnEntity, LocalTransform.FromPosition(spawnPos));
                    }
                }
            }
        }

        private static ZoneType GetZoneType(int x, int y, int zonesPerAxis)
        {
            int center = zonesPerAxis / 2;
            int distFromCenter = math.max(math.abs(x - center), math.abs(y - center));

            if (distFromCenter <= 1)
                return ZoneType.Restricted;  // Center zones
            else if (distFromCenter <= 2)
                return ZoneType.Inner;        // Inner patrol zones
            else if (distFromCenter <= 3)
                return ZoneType.Middle;       // Middle patrol zones
            else
                return ZoneType.Outer;        // Outer spawn zones
        }

        private static bool IsRestrictedZone(int x, int y, int zonesPerAxis)
        {
            int center = zonesPerAxis / 2;
            return math.abs(x - center) <= 1 && math.abs(y - center) <= 1;
        }

        private static float2 GetSpawnPointOffset(int index, int totalPoints)
        {
            // Distribute points in a pattern within the zone
            float angle = (index / (float)totalPoints) * math.PI * 2f;
            float radius = 0.5f + (index % 2) * 0.3f;
            return new float2(math.cos(angle) * radius, math.sin(angle) * radius);
        }
    }

    /// <summary>
    /// Represents a zone in the map
    /// </summary>
    public struct MapZone : IComponentData
    {
        public float3 center;
        public float2 bounds;
        public int zoneId;
        public ZoneType zoneType;
    }

    /// <summary>
    /// Predefined spawn point for a horde
    /// </summary>
    public struct HordeSpawnPoint : IComponentData
    {
        public float3 position;
        public float patrolRadius;
        public bool isOccupied;
        public int spawnId;
    }

    public enum ZoneType : byte
    {
        Restricted = 0,  // No spawning allowed (center/safe zones)
        Inner = 1,       // Close to center, light patrols
        Middle = 2,      // Medium distance, normal activity
        Outer = 3        // Far from center, heavy spawning
    }
}