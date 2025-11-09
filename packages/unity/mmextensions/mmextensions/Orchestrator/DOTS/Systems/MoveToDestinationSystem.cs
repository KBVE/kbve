using System.Runtime.CompilerServices;
using Unity.Burst;
using Unity.Burst.Intrinsics;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Physics;
using NSprites;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [BurstCompile]
    public partial struct MoveToDestinationSystem : ISystem
    {
        // PERFORMANCE: Staggered updates for 50k+ entities
        // Movement updates don't need to be every frame - 2-frame stagger is imperceptible
        // At 50k entities: 60fps = 3M moves/sec, 30fps = 1.5M moves/sec (2x reduction)
        private const int UPDATE_FREQUENCY = 2; // 1=every frame, 2=half entities per frame, 4=quarter per frame
        private ulong _frameCounter;

        #region jobs
        [BurstCompile]
        private struct CalculateMoveTimerJob : IJobChunk
        {
            private const float Threshold = .01f;

            [ReadOnly] public EntityTypeHandle EntityTypeHandle;
            public ComponentTypeHandle<MoveTimer> MoveTimer_CTH_RW;
            [ReadOnly] public ComponentTypeHandle<MoveSpeed> MoveSpeed_CTH_RO;
            [ReadOnly] public ComponentTypeHandle<LocalToWorld> LTW_CTH_RO;
            [ReadOnly] public ComponentTypeHandle<Destination> Destination_CTH_RO;
            public uint LastSystemVersion;

            public void Execute(in ArchetypeChunk chunk, int unfilteredChunkIndex, bool useEnabledMask, in v128 chunkEnabledMask)
            {
                if (chunk.DidChange(ref Destination_CTH_RO, LastSystemVersion)
                    || chunk.DidChange(ref MoveSpeed_CTH_RO, LastSystemVersion))
                {
                    var entities = chunk.GetNativeArray(EntityTypeHandle);
                    var ltw = chunk.GetNativeArray(ref LTW_CTH_RO);
                    var moveSpeeds = chunk.GetNativeArray(ref MoveSpeed_CTH_RO);
                    var destinations = chunk.GetNativeArray(ref Destination_CTH_RO);
                    var timers = chunk.GetNativeArray(ref MoveTimer_CTH_RW);

                    for (int entityIndex = 0; entityIndex < entities.Length; entityIndex++)
                    {
                        var distance = math.length(destinations[entityIndex].Value - ltw[entityIndex].Position.xy);
                        if (distance > Threshold)
                        {
                            timers[entityIndex] = new MoveTimer { RemainingTime = GetRemainingTime(distance, moveSpeeds[entityIndex].value) };
                        }
                    }
                }
            }
            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            private static float GetRemainingTime(in float2 pos, in float2 dest, float speed)
                => GetRemainingTime(math.length(dest - pos), speed);
            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            private static float GetRemainingTime(in float distance, float speed)
                => distance / speed;
        }
        [BurstCompile]
        private partial struct MoveJob : IJobEntity
        {
            public float DeltaTime;
            public ulong FrameCounter;
            public int UpdateFrequency;

            private void Execute(Entity entity, ref WorldPosition2D worldPos, ref PhysicsVelocity velocity,
                               ref MoveTimer timer, in Destination destination, in Combatant combatant)
            {
                // PERFORMANCE: Staggered updates - only process subset of entities each frame
                if (UpdateFrequency > 1)
                {
                    int entityBucket = (int)((uint)entity.Index % (uint)UpdateFrequency);
                    int currentBucket = (int)(FrameCounter % (uint)UpdateFrequency);
                    if (entityBucket != currentBucket)
                        return; // Skip this frame
                }

                // Only move if in states that allow movement
                bool canMove = combatant.Data.State == CombatantState.Idle
                            || combatant.Data.State == CombatantState.Chasing
                            || combatant.Data.State == CombatantState.Patrolling
                            || combatant.Data.State == CombatantState.Fleeing;

                if (!canMove || combatant.Data.IsDead)
                {
                    // Stop velocity for attacking, dead, stunned, casting, channeling states
                    velocity.Linear = float3.zero;
                    velocity.Angular = float3.zero;
                    return;
                }

                // velocity.Linear = (math.normalize(destination.Value - transform.Position.xy) * 2f).ToFloat3();
                // PERFORMANCE OPTIMIZATION: Update WorldPosition2D (cheap simulation position)
                // LocalTransform will be synced by VisibleEntitySyncSystem
                // We use kinematic movement (position-based) instead of physics velocity
                var direction = math.normalize(destination.Value - worldPos.Value);

                // Update simulation position directly (kinematic movement)
                worldPos.Value += direction * 2f * DeltaTime;

                // Clear physics velocity to prevent double movement
                // (VisibleEntitySyncSystem will sync WorldPosition2D → LocalTransform)
                velocity.Linear = float3.zero;
                velocity.Angular = float3.zero;

                timer.RemainingTime = math.max(0, timer.RemainingTime - DeltaTime);
            }
        }
        #endregion

        private struct SystemData : IComponentData
        {
            public EntityQuery MovableQuery;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var queryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<MoveSpeed>()
                .WithAll<LocalToWorld>()
                .WithAll<Destination>();
            var systemData = new SystemData { MovableQuery = state.GetEntityQuery(queryBuilder) };
            _ = state.EntityManager.AddComponentData(state.SystemHandle, systemData);

            queryBuilder.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _frameCounter++;

            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);

            // recalculate MoveTimer if MoveSpeed or Destination was changed
            var calculateMoveTimerJob = new CalculateMoveTimerJob
            {
                EntityTypeHandle = SystemAPI.GetEntityTypeHandle(),
                MoveTimer_CTH_RW = SystemAPI.GetComponentTypeHandle<MoveTimer>(false),
                MoveSpeed_CTH_RO = SystemAPI.GetComponentTypeHandle<MoveSpeed>(true),
                LTW_CTH_RO = SystemAPI.GetComponentTypeHandle<LocalToWorld>(true),
                Destination_CTH_RO = SystemAPI.GetComponentTypeHandle<Destination>(true),
                LastSystemVersion = state.LastSystemVersion
            };
            state.Dependency = calculateMoveTimerJob.ScheduleParallelByRef(systemData.MovableQuery, state.Dependency);

            // Schedule movement (state-based for all entities)
            var moveJob = new MoveJob
            {
                DeltaTime = SystemAPI.Time.DeltaTime,
                FrameCounter = _frameCounter,
                UpdateFrequency = UPDATE_FREQUENCY
            };
            state.Dependency = moveJob.ScheduleParallelByRef(state.Dependency);
        }
    }
}
