using Unity.Entities;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Simple zombie authoring component - exact match to Age-of-Sprites SoldierAuthoring pattern
    /// Attach this to prefabs with SpriteRendererAuthoring for clean ECS zombie entities
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
            }
        }

        [Header("Zombie Configuration")]
        [Tooltip("Zombie health points")]
        public float Health = 100f;

        [Tooltip("Zombie movement speed")]
        public float MoveSpeed = 2f;
    }
}