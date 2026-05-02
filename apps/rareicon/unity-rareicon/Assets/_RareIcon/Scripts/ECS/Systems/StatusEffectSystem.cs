using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Ticks active StatusEffect entries: DoT damage, energy drain, aggregate speed mul. MovementModifier lags locomotion by one frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(DamageSystem))]
    public partial struct StatusEffectSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<StatusEffect>();
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = new EntityCommandBuffer(Allocator.TempJob);

            new StatusEffectTickJob
            {
                Dt  = SystemAPI.Time.DeltaTime,
                Ecb = ecb.AsParallelWriter(),
                DeadLookup = SystemAPI.GetComponentLookup<DeadTag>(true),
            }.ScheduleParallel();

            state.CompleteDependency();
            ecb.Playback(state.EntityManager);
            ecb.Dispose();
        }
    }

    [BurstCompile]
    public partial struct StatusEffectTickJob : IJobEntity
    {
        public float Dt;
        public EntityCommandBuffer.ParallelWriter Ecb;
        [ReadOnly] public ComponentLookup<DeadTag> DeadLookup;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     DynamicBuffer<StatusEffect> effects,
                     ref Health health,
                     ref Energy energy,
                     ref MovementModifier modifier)
        {
            bool wasAlive = health.Value > 0f;
            float speedMul = modifier.AuraBoost > 0f ? modifier.AuraBoost : 1.0f;

            for (int i = effects.Length - 1; i >= 0; i--)
            {
                var e = effects[i];

                switch (e.Kind)
                {
                    case StatusEffectKind.Poison:
                    case StatusEffectKind.Fire:
                        health.Value = math.max(0f, health.Value - e.Magnitude * Dt);
                        break;
                    case StatusEffectKind.Curse:
                        energy.Value = math.max(0f, energy.Value - e.Magnitude * Dt);
                        break;
                    case StatusEffectKind.Ice:
                        speedMul *= math.clamp(e.Magnitude, 0.0f, 1.0f);
                        break;
                }

                e.Remaining -= Dt;
                if (e.Remaining <= 0f) effects.RemoveAtSwapBack(i);
                else                   effects[i] = e;
            }

            modifier.SpeedMul = speedMul;

            if (wasAlive && health.Value <= 0f && !DeadLookup.HasComponent(entity))
            {
                Ecb.AddComponent<DeadTag>(chunkIdx, entity);
            }
        }
    }
}
