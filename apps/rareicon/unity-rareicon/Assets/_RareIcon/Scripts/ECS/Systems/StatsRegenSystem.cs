using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Ticks Health / Energy / Mana toward Max at each stat's PerSecond rate
    /// (or away from it for negative regen — poison, hunger, drain). Three
    /// independent queries so each only iterates entities that actually have
    /// the stat + matching regen pair. Burst-compiled, no managed access.
    ///
    /// DeadTag is added when Health hits 0 — separate systems handle the
    /// consequences (loot, despawn, animation) so we stay decoupled.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct StatsRegenSystem : ISystem
    {
        EntityQuery _newlyDeadQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state) { }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;
            var ecb = new EntityCommandBuffer(Unity.Collections.Allocator.Temp);

            // ---- Health ---------------------------------------------------
            foreach (var (h, hr, entity) in
                     SystemAPI.Query<RefRW<Health>, RefRO<HealthRegen>>().WithEntityAccess())
            {
                float v = h.ValueRO.Value + hr.ValueRO.PerSecond * dt;
                v = math.clamp(v, 0f, h.ValueRO.Max);
                h.ValueRW.Value = v;

                if (v <= 0f && !SystemAPI.HasComponent<DeadTag>(entity))
                    ecb.AddComponent<DeadTag>(entity);
            }

            // ---- Energy ---------------------------------------------------
            foreach (var (e, er) in
                     SystemAPI.Query<RefRW<Energy>, RefRO<EnergyRegen>>())
            {
                float v = e.ValueRO.Value + er.ValueRO.PerSecond * dt;
                e.ValueRW.Value = math.clamp(v, 0f, e.ValueRO.Max);
            }

            // ---- Mana -----------------------------------------------------
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
