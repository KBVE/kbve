using Unity.Entities;
using Unity.Burst;
using Unity.Mathematics;
using Unity.Transforms;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Initializes entity state for zombies to start patrolling
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(ZombieAvoidanceInitSystem))]
    [BurstCompile]
    public partial struct EntityStateInitSystem : ISystem
    {
        private EntityQuery _zombieQuery;

        public void OnCreate(ref SystemState state)
        {
            // Find zombies that need state initialization
            _zombieQuery = state.GetEntityQuery(
                ComponentType.ReadWrite<EntityState>(),
                ComponentType.ReadWrite<Movement>(),
                ComponentType.ReadOnly<LocalTransform>(),
                ComponentType.ReadOnly<ZombieTag>()
            );
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Get map settings for patrol bounds
            var mapSettings = SystemAPI.HasSingleton<MapSettings>()
                ? SystemAPI.GetSingleton<MapSettings>()
                : MapSettings.CreateDefault();

            // Initialize zombie states to patrolling
            var initJob = new InitStateJob
            {
                currentTime = currentTime,
                mapSettings = mapSettings
            };

            state.Dependency = initJob.ScheduleParallel(_zombieQuery, state.Dependency);
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }
    }

    [BurstCompile]
    partial struct InitStateJob : IJobEntity
    {
        public float currentTime;
        public MapSettings mapSettings;

        public void Execute(
            [EntityIndexInQuery] int entityIndex,
            ref EntityState entityState,
            ref Movement movement,
            in LocalTransform transform)
        {
            // Only initialize if not already set
            if (entityState.flags == EntityStateFlags.None || entityState.flags == EntityStateFlags.Idle)
            {
                // Start zombies in patrol state
                StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Patrolling, currentTime);
                StateHelpers.AddFlag(ref entityState, EntityStateFlags.SearchingTarget);

                // CRITICAL FIX: Set initial random destination instead of (0,0,0)
                // This prevents all zombies from clustering at map center on spawn
                if (math.lengthsq(movement.destination) < 0.1f) // If destination is near zero
                {
                    // Ensure seed is never zero (entityIndex could be 0)
                    uint seed = math.max(1u, (uint)(entityIndex + 1) * 12345u);
                    Unity.Mathematics.Random random = new Unity.Mathematics.Random(seed);
                    float halfMapSize = mapSettings.mapSize * 0.4f; // Use 80% of map to avoid edges

                    // Generate random initial patrol destination
                    movement.destination = new float3(
                        random.NextFloat(-halfMapSize, halfMapSize),
                        random.NextFloat(-halfMapSize, halfMapSize),
                        transform.Position.z
                    );

                    // Set initial facing direction toward destination
                    float2 direction = movement.destination.xy - transform.Position.xy;
                    if (math.lengthsq(direction) > 0.01f)
                    {
                        movement.facingDirection = math.normalize(direction);
                    }
                }
            }
        }
    }
}