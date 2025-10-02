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
                if (authoring.RockPrefabs == null)
                    return;

                var rockCollectionEntity = CreateAdditionalEntity(TransformUsageFlags.None);
                var rockBuffer = AddBuffer<PrefabLink>(rockCollectionEntity);
                rockBuffer.Capacity = authoring.RockPrefabs.Length;
                for (int i = 0; i < authoring.RockPrefabs.Length; i++)
                    _ = rockBuffer.Add(new PrefabLink { link = GetEntity(authoring.RockPrefabs[i], TransformUsageFlags.None) });

                AddComponent(GetEntity(TransformUsageFlags.None), new MapSettings
                {
                    rockCollectionLink = rockCollectionEntity,
                    rockCount = authoring.RockCount,
                    size = authoring.Rect
                });
            }
        }

        [FormerlySerializedAs("_gizmoColor ")] public Color GizmoColor = Color.green;
        [Space]

        [FormerlySerializedAs("_rect")]
        [Tooltip("Defines the world bounds as (MinXY, MaxXY). Default is -25 to 25 grid.")]
        public float2x2 Rect = new float2x2(
            new float2(-25f, -25f), // bottom-left
            new float2(25f, 25f)    // top-right
        );

        [FormerlySerializedAs("_rockCount")] public int RockCount;
        [FormerlySerializedAs("_rockPrefabs")] public GameObject[] RockPrefabs;

#if UNITY_EDITOR
    private void OnDrawGizmosSelected()
    {
        Utils.DrawRect(Rect, GizmoColor);
    }
#endif
    }
}