using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Ticks Health / Energy / Mana toward Max; Energy regen is scaled by hungerFactor × fatigueFactor so starved or exhausted units don't recover stamina. Three [BurstCompile] IJobEntity passes run in parallel — RegenHealthJob writes Health + adds DeadTag via EndSimulationEntityCommandBufferSystem ParallelWriter on death, RegenEnergyJob reads Hunger/Fatigue ComponentLookups, RegenManaJob is a straight clamp+add. Previously three main-thread foreach scans iterated every Health/Energy/Mana entity per frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct StatsRegenSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt   = SystemAPI.Time.DeltaTime;
            var   ecb  = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                                  .CreateCommandBuffer(state.WorldUnmanaged);
            var   pw   = ecb.AsParallelWriter();

            var deadLookup    = SystemAPI.GetComponentLookup<DeadTag>(true);
            var hungerLookup  = SystemAPI.GetComponentLookup<Hunger>(true);
            var fatigueLookup = SystemAPI.GetComponentLookup<Fatigue>(true);

            var healthHandle = new RegenHealthJob
            {
                Dt         = dt,
                Ecb        = pw,
                DeadLookup = deadLookup,
            }.ScheduleParallel(state.Dependency);

            var energyHandle = new RegenEnergyJob
            {
                Dt            = dt,
                HungerLookup  = hungerLookup,
                FatigueLookup = fatigueLookup,
            }.ScheduleParallel(state.Dependency);

            var manaHandle = new RegenManaJob
            {
                Dt = dt,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = JobHandle.CombineDependencies(healthHandle, energyHandle, manaHandle);
        }
    }

    [BurstCompile]
    public partial struct RegenHealthJob : IJobEntity
    {
        public float                                   Dt;
        public EntityCommandBuffer.ParallelWriter      Ecb;
        [ReadOnly] public ComponentLookup<DeadTag>     DeadLookup;

        void Execute([ChunkIndexInQuery] int chunkIndex, Entity entity, ref Health h, in HealthRegen hr)
        {
            float v = math.clamp(h.Value + hr.PerSecond * Dt, 0f, h.Max);
            h.Value = v;
            if (v <= 0f && !DeadLookup.HasComponent(entity))
                Ecb.AddComponent<DeadTag>(chunkIndex, entity);
        }
    }

    [BurstCompile]
    public partial struct RegenEnergyJob : IJobEntity
    {
        public float Dt;
        [ReadOnly] public ComponentLookup<Hunger>  HungerLookup;
        [ReadOnly] public ComponentLookup<Fatigue> FatigueLookup;

        void Execute(Entity entity, ref Energy e, in EnergyRegen er)
        {
            float rate = er.PerSecond;
            if (rate > 0f)
            {
                if (HungerLookup.HasComponent(entity))
                {
                    var h = HungerLookup[entity];
                    rate *= math.saturate(1f - (h.Max > 0f ? h.Value / h.Max : 0f));
                }
                if (FatigueLookup.HasComponent(entity))
                {
                    var f = FatigueLookup[entity];
                    rate *= math.saturate(1f - (f.Max > 0f ? f.Value / f.Max : 0f));
                }
            }
            e.Value = math.clamp(e.Value + rate * Dt, 0f, e.Max);
        }
    }

    [BurstCompile]
    public partial struct RegenManaJob : IJobEntity
    {
        public float Dt;

        void Execute(ref Mana m, in ManaRegen mr)
        {
            float v = m.Value + mr.PerSecond * Dt;
            m.Value = math.clamp(v, 0f, m.Max);
        }
    }
}
