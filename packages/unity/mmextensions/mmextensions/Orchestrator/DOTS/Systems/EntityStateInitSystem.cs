using Unity.Entities;
using Unity.Burst;

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
                ComponentType.ReadOnly<ZombieTag>()
            );
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Initialize zombie states to patrolling
            var initJob = new InitStateJob
            {
                currentTime = currentTime
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

        public void Execute(ref EntityState entityState)
        {
            // Only initialize if not already set
            if (entityState.flags == EntityStateFlags.None || entityState.flags == EntityStateFlags.Idle)
            {
                // Start zombies in patrol state
                StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Patrolling, currentTime);
                StateHelpers.AddFlag(ref entityState, EntityStateFlags.SearchingTarget);
            }
        }
    }
}