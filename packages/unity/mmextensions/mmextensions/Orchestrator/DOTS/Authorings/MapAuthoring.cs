using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Serialization;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public class MapAuthoring : MonoBehaviour
    {
        private class MapBaker : Baker<MapAuthoring>
        {
            public override void Bake(MapAuthoring authoring)
            {
                // Create resource collection entity if we have resource prefabs
                Entity resourceCollectionEntity = Entity.Null;
                if (authoring.ResourcePrefabs != null && authoring.ResourcePrefabs.Length > 0)
                {
                    resourceCollectionEntity = CreateAdditionalEntity(TransformUsageFlags.None);
                    var resourceBuffer = AddBuffer<PrefabLink>(resourceCollectionEntity);
                    resourceBuffer.Capacity = authoring.ResourcePrefabs.Length;
                    
                    for (int i = 0; i < authoring.ResourcePrefabs.Length; i++)
                    {
                        if (authoring.ResourcePrefabs[i] != null)
                        {
                            _ = resourceBuffer.Add(new PrefabLink 
                            { 
                                link = GetEntity(authoring.ResourcePrefabs[i], TransformUsageFlags.Dynamic) 
                            });
                        }
                    }
                }

                AddComponent(GetEntity(TransformUsageFlags.None), new MapSettings
                {
                    resourceCollectionLink = resourceCollectionEntity,
                    resourceCount = authoring.ResourceCount,
                    size = authoring.Rect
                });
            }
        }

        [Header("Map Bounds")]
        [FormerlySerializedAs("_gizmoColor")]
        public Color GizmoColor = Color.green;
        
        [Space]
        [FormerlySerializedAs("_rect")]
        [Tooltip("Defines the world bounds as (MinXY, MaxXY). Default is -25 to 25 grid.")]
        public float2x2 Rect = new float2x2(
            new float2(-25f, -25f), // bottom-left
            new float2(25f, 25f)    // top-right
        );

        [Header("Resources (Rocks, Trees, Ore, etc.)")]
        [Tooltip("All resource node prefabs to spawn (should have ResourceAuthoring component)")]
        [FormerlySerializedAs("_rockPrefabs")]
        public GameObject[] ResourcePrefabs;
        
        [Tooltip("Total number of resource nodes to spawn randomly on the map")]
        [FormerlySerializedAs("_rockCount")]
        [Min(0)]
        public int ResourceCount = 100;

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            Utils.DrawRect(Rect, GizmoColor);
        }

        private void OnValidate()
        {
            if (ResourceCount < 0)
                ResourceCount = 0;
        }
#endif
    }
}