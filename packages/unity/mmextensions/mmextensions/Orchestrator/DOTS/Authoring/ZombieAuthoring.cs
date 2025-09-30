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
    /// Simple zombie authoring component that is designed to create the base zombie entitiy that then follows the base AoS struct.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Transform), typeof(NSprites.SpriteAnimatedRendererAuthoring))]
    [HelpURL("https://kbve.com/application/unity/#zombieauthoring")]
    public class ZombieAuthoring : MonoBehaviour
    {
        private class ZombieBaker : Baker<ZombieAuthoring>
        {
            public override void Bake(ZombieAuthoring authoring)
            {
                // NOTE: Keep None to match AoS pattern when another baker (sprite) adds LocalTransform.
                // If this prefab has no other baker providing LocalTransform, switch to TransformUsageFlags.Dynamic.
                var entity = GetEntity(TransformUsageFlags.None);

                // Add zombie tag for identification
                AddComponent<ZombieTag>(entity);

                // Clamp authoring values defensively (belt & suspenders; also add [Min]/OnValidate on fields)
                var radius = math.clamp(authoring.CollisionRadius, 0.05f, 5f);
                var health = math.max(0.01f, authoring.Health);
                var speed  = math.max(0f,     authoring.MoveSpeed);

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
                        Radius = radius
                    }, filter)
                });

                // Add physics mass for movement/forces
                // Kinematic mass since we drive motion via systems, not forces

                AddComponent(entity, PhysicsMass.CreateKinematic(MassProperties.UnitSphere));

                // Add new consolidated components for Unity DOTS movement
                var initialState = EntityState.CreateDefault();
                // Start in patrolling state
                initialState.flags = EntityStateFlags.Patrolling | EntityStateFlags.SearchingTarget;
                AddComponent(entity, initialState);

                AddComponent(entity, EntityCore.CreateZombie(health, speed));

                // Initialize movement with current position as destination
                var movement = Movement.CreateDefault(2f);
                
                //! - Might be cheaper to use the authoring.transform.position or maybe spawnPos ? we will have to test case and determine it.
                movement.destination = GetComponent<Transform>().position; // => Cheaper to use the authoring.transform.position
                //movement.destination = authoring.transform.position;
                AddComponent(entity, movement);

                AddComponent(entity, NavigationData.CreateDefault(15f));
                AddComponent(entity, AvoidanceData.CreateDefault(2f));

                // Add formation member component for squad-like coordinated movement (index will be set by spawning system)
                AddComponent(entity, ZombieFormationMember.CreateDefault(0));
            }
        }

        // --- Fields (make Inspector enforce sane values) ---

        [Header("Zombie Configuration")]
        [Tooltip("Zombie health points")]
        [Min(0.01f)]
        public float Health = 100f;

        [Tooltip("Zombie movement speed")]
        [Min(0f)]
        public float MoveSpeed = 2f;

        [Header("Physics")]
        [Tooltip("Collision radius for physics interactions")]
        [Range(0.05f, 5f)]
        public float CollisionRadius = 0.5f;

        // --- Editor-side guard (keeps values valid as you edit) ---
        void OnValidate()
        {
            if (Health < 0.01f) Health = 0.01f;
            if (MoveSpeed < 0f) MoveSpeed = 0f;
            CollisionRadius = math.clamp(CollisionRadius, 0.05f, 5f);
        }


    }
}