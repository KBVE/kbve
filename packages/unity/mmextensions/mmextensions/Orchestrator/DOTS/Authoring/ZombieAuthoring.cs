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

                // Note: Health and speed are now in EntityCore component

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

                // Add new consolidated components for Unity DOTS movement
                var initialState = EntityState.CreateDefault();
                // Start in patrolling state
                initialState.flags = EntityStateFlags.Patrolling | EntityStateFlags.SearchingTarget;
                AddComponent(entity, initialState);

                AddComponent(entity, EntityCore.CreateZombie(authoring.Health, authoring.MoveSpeed));

                // Initialize movement with current position as destination
                var movement = Movement.CreateDefault(2f);
                movement.destination = GetComponent<Transform>().position;
                AddComponent(entity, movement);

                AddComponent(entity, NavigationData.CreateDefault(15f));
                AddComponent(entity, AvoidanceData.CreateDefault(2f));

                // Add formation member component for squad-like coordinated movement (index will be set by spawning system)
                AddComponent(entity, ZombieFormationMember.CreateDefault(0));
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