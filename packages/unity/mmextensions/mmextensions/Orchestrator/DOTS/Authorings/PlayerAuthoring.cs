using Unity.Entities;
using UnityEngine;
using Unity.Mathematics;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Player authoring component for DOTS conversion.
    /// Converts GameObject player into ECS entity with all required components.
    /// </summary>
    public class PlayerAuthoring : MonoBehaviour
    {
        private class PlayerBaker : Baker<PlayerAuthoring>
        {
            public override void Bake(PlayerAuthoring authoring)
            {
                var entity = GetEntity(TransformUsageFlags.Dynamic);

                // Add PlayerTag to identify this as a player-controlled entity
                // This distinguishes players from allied NPCs that use Player component
                AddComponent<PlayerTag>(entity);

                // Add universal EntityComponent for hover/selection system
                // Player entities have unique ULID generated at spawn time
                var entityData = new EntityData
                {
                    Ulid = default, // Will be overwritten at spawn with unique ULID
                    Type = EntityType.Player | EntityType.Unit | EntityType.Interactable | EntityType.Ally,
                    ActionFlags = EntityActionFlags.CanInteract | EntityActionFlags.CanAttack | EntityActionFlags.CanMove,
                    WorldPos = authoring.transform.position
                };
                AddComponent(entity, new EntityComponent { Data = entityData });

                // Add Player component with stats
                var playerData = new PlayerData
                {
                    TemplateUlid = default, // Will be set by spawning system
                    Class = authoring.PlayerClass,
                    Flags = PlayerFlags.IsOnline, // Player starts online
                    State = PlayerState.Idle,
                    Level = authoring.Level,
                    Health = authoring.Health,
                    MaxHealth = authoring.MaxHealth,
                    Mana = authoring.Mana,
                    MaxMana = authoring.MaxMana,
                    Gold = authoring.StartingGold,
                    Experience = 0,
                    MoveSpeed = authoring.MoveSpeed
                };
                AddComponent(entity, new Player { Data = playerData });

                // Add PlayerID for identification
                AddComponent(entity, new PlayerID
                {
                    instanceUlid = default // Will be set at spawn
                });

                // Add movement components
                AddComponent<Destination>(entity);
                AddComponent<MoveTimer>(entity);
                AddComponent(entity, new MoveSpeed { value = authoring.MoveSpeed });

                // Add SpatialIndex so players are included in CSR Grid for dynamic queries
                // CRITICAL: Without this, zombies can't find players to attack!
                AddComponent(entity, new SpatialIndex
                {
                    Radius = 1f, // Player collision radius
                    LayerMask = uint.MaxValue, // Visible to all layers
                    IncludeInQueries = true, // CRITICAL: Must be true for spatial queries
                    Priority = 10 // Highest priority (players are most important)
                });

                // Add spatial settings for moving units (dynamic entities)
                // Players move constantly based on input
                AddComponent(entity, SpatialSettings.MovingUnit);

                // NOTE: PhysicsVelocity is automatically added by Unity.Physics.Authoring.RigidbodyBaker
                // when the GameObject has a Rigidbody component. Do NOT add it manually!
            }
        }

        [Header("Player Identity")]
        [Tooltip("Player class/profession")]
        public PlayerClass PlayerClass = PlayerClass.Warrior;

        [Header("Player Stats")]
        [Tooltip("Player level")]
        [Range(1, 1000)]
        public int Level = 1;

        [Tooltip("Current health points")]
        [Range(0, int.MaxValue)]
        public int Health = 200;

        [Tooltip("Maximum health points")]
        [Range(1, int.MaxValue)]
        public int MaxHealth = 200;

        [Tooltip("Current mana points")]
        [Range(0, int.MaxValue)]
        public int Mana = 100;

        [Tooltip("Maximum mana points")]
        [Range(0, int.MaxValue)]
        public int MaxMana = 100;

        [Tooltip("Starting gold amount")]
        [Range(0, int.MaxValue)]
        public int StartingGold = 0;

        [Tooltip("Movement speed in units per second")]
        [Range(0f, 100f)]
        public float MoveSpeed = 5f;

#if UNITY_EDITOR
        private void OnValidate()
        {
            // Ensure health doesn't exceed max
            if (Health > MaxHealth)
                Health = MaxHealth;

            // Ensure mana doesn't exceed max
            if (Mana > MaxMana)
                Mana = MaxMana;

            // Ensure valid stats
            if (Level < 1) Level = 1;
            if (MaxHealth < 1) MaxHealth = 1;
            if (MoveSpeed < 0f) MoveSpeed = 0f;
            if (StartingGold < 0) StartingGold = 0;
        }
#endif
    }

    /// <summary>
    /// Tag component to identify player entities.
    /// Used for queries that need to find all players.
    /// </summary>
    public struct PlayerTag : IComponentData
    {
    }
}
