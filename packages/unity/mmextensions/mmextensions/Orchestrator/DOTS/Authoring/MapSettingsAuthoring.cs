using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Serialization;

using KBVE.MMExtensions.Orchestrator.DOTS.Systems;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Authoring component for map generation settings
    /// </summary>
    public class MapSettingsAuthoring : MonoBehaviour
    {
        [Header("Map Configuration")]
        [Tooltip("Total size of the map in units")]
        public float mapSize = 5000f;

        [Tooltip("Number of zones per axis (creates NxN grid)")]
        [Range(5, 20)]
        public int zonesPerAxis = 10;

        [Tooltip("Number of horde spawn points per zone")]
        [Range(1, 20)]
        public int hordeSpawnPointsPerZone = 10;

        [Tooltip("Default patrol radius for hordes")]
        [Range(50f, 500f)]
        public float defaultPatrolRadius = 150f;


        class Baker : Baker<MapSettingsAuthoring>
        {
            public override void Bake(MapSettingsAuthoring authoring)
            {
                var entity = GetEntity(TransformUsageFlags.None);

                AddComponent(entity, new MapSettings
                {
                    mapSize = authoring.mapSize,
                    zonesPerAxis = authoring.zonesPerAxis,
                    hordeSpawnPointsPerZone = authoring.hordeSpawnPointsPerZone,
                    defaultPatrolRadius = authoring.defaultPatrolRadius
                });
            }
        }

                
#if UNITY_EDITOR

        private void OnDrawGizmosSelected()
        {
            // Draw map bounds
            Gizmos.color = Color.green;
            Gizmos.DrawWireCube(transform.position, new Vector3(mapSize, mapSize, 10));

            // Draw zone grid
            float zoneSize = mapSize / zonesPerAxis;
            Gizmos.color = Color.yellow;

            for (int i = 0; i <= zonesPerAxis; i++)
            {
                float offset = -mapSize * 0.5f + i * zoneSize;

                // Vertical lines
                Vector3 start = transform.position + new Vector3(offset, -mapSize * 0.5f, 0);
                Vector3 end = transform.position + new Vector3(offset, mapSize * 0.5f, 0);
                Gizmos.DrawLine(start, end);

                // Horizontal lines
                start = transform.position + new Vector3(-mapSize * 0.5f, offset, 0);
                end = transform.position + new Vector3(mapSize * 0.5f, offset, 0);
                Gizmos.DrawLine(start, end);
            }

            // Highlight restricted zones (center)
            int center = zonesPerAxis / 2;
            Gizmos.color = new Color(1f, 0f, 0f, 0.2f);

            for (int x = center - 1; x <= center + 1; x++)
            {
                for (int y = center - 1; y <= center + 1; y++)
                {
                    if (x < 0 || x >= zonesPerAxis || y < 0 || y >= zonesPerAxis)
                        continue;

                    Vector3 zoneCenter = transform.position + new Vector3(
                        (x - zonesPerAxis * 0.5f + 0.5f) * zoneSize,
                        (y - zonesPerAxis * 0.5f + 0.5f) * zoneSize,
                        0
                    );

                    Gizmos.DrawCube(zoneCenter, new Vector3(zoneSize * 0.9f, zoneSize * 0.9f, 1f));
                }
            }
        }
#endif
    }
}