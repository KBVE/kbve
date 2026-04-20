using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Ticks Health / Energy / Mana toward Max; Energy regen is scaled by hungerFactor × fatigueFactor so starved or exhausted units don't recover stamina.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct StatsRegenSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;
            var ecb = new EntityCommandBuffer(Unity.Collections.Allocator.Temp);

            foreach (var (h, hr, entity) in
                     SystemAPI.Query<RefRW<Health>, RefRO<HealthRegen>>().WithEntityAccess())
            {
                float v = math.clamp(h.ValueRO.Value + hr.ValueRO.PerSecond * dt, 0f, h.ValueRO.Max);
                h.ValueRW.Value = v;
                if (v <= 0f && !SystemAPI.HasComponent<DeadTag>(entity))
                    ecb.AddComponent<DeadTag>(entity);
            }

            var hungerLookup  = SystemAPI.GetComponentLookup<Hunger>(isReadOnly: true);
            var fatigueLookup = SystemAPI.GetComponentLookup<Fatigue>(isReadOnly: true);

            foreach (var (e, er, entity) in
                     SystemAPI.Query<RefRW<Energy>, RefRO<EnergyRegen>>().WithEntityAccess())
            {
                float rate = er.ValueRO.PerSecond;
                if (rate > 0f)
                {
                    if (hungerLookup.HasComponent(entity))
                    {
                        var h = hungerLookup[entity];
                        rate *= math.saturate(1f - (h.Max > 0f ? h.Value / h.Max : 0f));
                    }
                    if (fatigueLookup.HasComponent(entity))
                    {
                        var f = fatigueLookup[entity];
                        rate *= math.saturate(1f - (f.Max > 0f ? f.Value / f.Max : 0f));
                    }
                }
                e.ValueRW.Value = math.clamp(e.ValueRO.Value + rate * dt, 0f, e.ValueRO.Max);
            }

            foreach (var (m, mr) in
                     SystemAPI.Query<RefRW<Mana>, RefRO<ManaRegen>>())
            {
                float v = m.ValueRO.Value + mr.ValueRO.PerSecond * dt;
                m.ValueRW.Value = math.clamp(v, 0f, m.ValueRO.Max);
            }

            ecb.Playback(state.EntityManager);
            ecb.Dispose();
        }
    }
}
