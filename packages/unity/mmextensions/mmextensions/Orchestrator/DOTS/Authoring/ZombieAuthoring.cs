using Unity.Entities;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Simple zombie authoring component - exact match to Age-of-Sprites SoldierAuthoring pattern
    /// Attach this to prefabs with SpriteRendererAuthoring for clean ECS zombie entities
    /// Now includes automatic view culling support for performance optimization
    /// </summary>
    public class ZombieAuthoring : MonoBehaviour
    {
        private class ZombieBaker : Baker<ZombieAuthoring>
        {
            public override void Bake(ZombieAuthoring authoring)
            {
                // Use TransformUsageFlags.None to match Age-of-Sprites pattern exactly
                var entity = GetEntity(TransformUsageFlags.None);

                // Add zombie tag for identification
                AddComponent<ZombieTag>(entity);

                // Add zombie data components
                AddComponent(entity, new ZombieHealth { value = authoring.Health });
                AddComponent(entity, new ZombieSpeed { value = authoring.MoveSpeed });

                // Add spatial indexing component for KD-Tree queries
                AddComponent(entity, SpatialPosition.Create(authoring.transform.position));

                // Add view culling components for automatic visibility management
                AddComponent(entity, new ViewRadius { Value = authoring.CullingRadius });

                // Add Visible component (enabled by default)
                AddComponent<Visible>(entity);
                SetComponentEnabled<Visible>(entity, true);
            }
        }

        [Header("Zombie Configuration")]
        [Tooltip("Zombie health points")]
        public float Health = 100f;

        [Tooltip("Zombie movement speed")]
        public float MoveSpeed = 2f;

        [Header("View Culling")]
        [Tooltip("Radius used for view frustum culling (in world units)")]
        [Range(1f, 10f)]
        public float CullingRadius = 3f;
    }
}