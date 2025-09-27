using Unity.Entities;
using Unity.Entities.Baking;
using Unity.Physics;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Collections;
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

                // Add ECS physics collider with collision filter
                // Zombies MUST collide with each other to prevent stacking!
                var filter = new Unity.Physics.CollisionFilter
                {
                    BelongsTo = 1u << 0,     // Zombie layer
                    CollidesWith = uint.MaxValue, // Collide with EVERYTHING including other zombies
                    GroupIndex = 0
                };

                AddComponent(entity, new PhysicsCollider
                {
                    Value = Unity.Physics.SphereCollider.Create(new SphereGeometry
                    {
                        Center = float3.zero,
                        Radius = authoring.CollisionRadius
                    }, filter)
                });

                // Add physics mass for movement/forces
                AddComponent(entity, PhysicsMass.CreateKinematic(MassProperties.UnitSphere));

                // Add zombie navigation components for Unity DOTS movement
                AddComponent(entity, ZombieNavigation.CreateDefault());
                AddComponent(entity, new ZombieDestination
                {
                    targetPosition = GetComponent<Transform>().position,
                    facingDirection = new float3(0, 0, 1)
                });
                AddComponent(entity, ZombiePathfindingConfig.CreateDefault(MinionType.Tank));
                AddComponent(entity, new ZombiePathfindingState
                {
                    state = ZombiePathfindingState.PathfindingState.SearchingForTarget,
                    lastPathCalculation = 0f,
                    lastDestinationUpdate = 0f,
                    pathFailures = 0,
                    distanceToDestination = 0f,
                    isMoving = false
                });

                // Add horde member component for squad-like coordinated movement (index will be set by spawning system)
                AddComponent(entity, ZombieHordeMember.CreateDefault(0));
            }
        }

        [Header("Zombie Configuration")]
        [Tooltip("Zombie health points")]
        public float Health = 100f;

        [Tooltip("Zombie movement speed")]
        public float MoveSpeed = 2f;

        [Header("Physics")]
        [Tooltip("Collision radius for physics interactions")]
        [Range(0.1f, 2f)]
        public float CollisionRadius = 0.5f;
    }
}