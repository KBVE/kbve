using NSprites;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    
    [BurstCompile]
    [UpdateBefore(typeof(SpriteUVAnimationSystem))]
    public partial struct CombatAnimationControlSystem : ISystem
    {
        [BurstCompile]
        private partial struct ChangeAnimationJob : IJobEntity
        {
            public AnimationSettings AnimationSettings;
            public double Time;

            private void Execute(AnimatorAspect animator, in Combatant combatant)
            {
                // Determine animation hash based on combatant state
                int animationHash = GetAnimationHashForState(combatant.Data.State);
                animator.SetAnimation(animationHash, Time);
            }

            private int GetAnimationHashForState(CombatantState state)
            {
                return state switch
                {
                    CombatantState.Idle => AnimationSettings.IdleHash,
                    CombatantState.Patrolling => AnimationSettings.WalkHash,
                    CombatantState.Chasing => AnimationSettings.WalkHash, // or RunHash if you have one
                    CombatantState.Attacking => AnimationSettings.AttackHash, // You may want an AttackHash
                    CombatantState.Fleeing => AnimationSettings.WalkHash,
                    CombatantState.Dead => AnimationSettings.DeathHash, 
                    CombatantState.Stunned => AnimationSettings.HurtHash,
                    CombatantState.Casting => AnimationSettings.IdleHash, // You may want a CastHash
                    CombatantState.Channeling => AnimationSettings.IdleHash,
                    _ => AnimationSettings.IdleHash
                };
            }
        }

        private struct SystemData : IComponentData
        {
            public EntityQuery CombatantQuery;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var systemData = new SystemData();
            var queryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Combatant>()
                .WithAspect<AnimatorAspect>()
                .WithOptions(EntityQueryOptions.IgnoreComponentEnabledState);
            // var queryBuilder = new EntityQueryBuilder(Allocator.Temp)
            //     .WithAll<MovingTag>()
            //     .WithAspect<AnimatorAspect>()
            //     .WithOptions(EntityQueryOptions.IgnoreComponentEnabledState);
            var CombatantQuery = state.GetEntityQuery(queryBuilder);
            CombatantQuery.AddChangedVersionFilter(ComponentType.ReadOnly<Combatant>());
            //CombatantQuery.AddChangedVersionFilter(ComponentType.ReadOnly<MovingTag>());
            
            systemData.CombatantQuery = CombatantQuery;

            _ = state.EntityManager.AddComponentData(state.SystemHandle, systemData);

            queryBuilder.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);
            if (!SystemAPI.TryGetSingleton<AnimationSettings>(out var animationSettings))
                return;
            var time = SystemAPI.Time.ElapsedTime;

            var animationSwitchJob = new ChangeAnimationJob
            {
                AnimationSettings = animationSettings,
                Time = time
            };
            state.Dependency = animationSwitchJob.ScheduleParallelByRef(systemData.CombatantQuery, state.Dependency);
        }
    }
}