using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Every HealingAura.Period seconds, the caster finds the nearest injured Player-faction ally inside Range and restores HealingAura.Amount HP if it has HealingAura.ManaCost Mana. Main-thread ISystem — low frequency + cross-entity writes, so the overhead is negligible.</summary>
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(SpellCastSystem))]
    public partial struct HealingAuraSystem : ISystem
    {
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<HealingAura>();
        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            state.CompleteDependency();

            float dt = SystemAPI.Time.DeltaTime;

            var em = state.EntityManager;

            var allies = new NativeList<AllySlot>(64, Allocator.Temp);
            foreach (var (health, transform, faction, ally) in
                     SystemAPI.Query<RefRO<Health>, RefRO<LocalTransform>, RefRO<Faction>>().WithEntityAccess())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                var h = health.ValueRO;
                if (h.Value >= h.Max) continue;
                allies.Add(new AllySlot
                {
                    Entity  = ally,
                    Pos     = new float2(transform.ValueRO.Position.x, transform.ValueRO.Position.y),
                    Missing = h.Max - h.Value,
                });
            }

            foreach (var (auraRef, manaRef, transform, faction, entity) in
                     SystemAPI.Query<RefRW<HealingAura>, RefRW<Mana>, RefRO<LocalTransform>, RefRO<Faction>>().WithEntityAccess())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;

                ref var aura = ref auraRef.ValueRW;
                aura.TimeSinceHeal += dt;
                if (aura.TimeSinceHeal < aura.Period) continue;
                if (manaRef.ValueRO.Value < aura.ManaCost) continue;

                float rangeSq = aura.Range * aura.Range;
                float bestSq = rangeSq;
                float bestMissing = 0f;
                int   bestIdx = -1;
                float2 myPos = new float2(transform.ValueRO.Position.x, transform.ValueRO.Position.y);

                for (int i = 0; i < allies.Length; i++)
                {
                    var cand = allies[i];
                    if (cand.Entity == entity) continue;
                    float d2 = math.distancesq(myPos, cand.Pos);
                    if (d2 > bestSq) continue;
                    if (cand.Missing <= bestMissing) continue;
                    bestSq     = d2;
                    bestMissing = cand.Missing;
                    bestIdx    = i;
                }

                if (bestIdx < 0) continue;

                var target = allies[bestIdx];
                var health = em.GetComponentData<Health>(target.Entity);
                health.Value = math.min(health.Max, health.Value + aura.Amount);
                em.SetComponentData(target.Entity, health);

                var mana = manaRef.ValueRW;
                mana.Value -= aura.ManaCost;
                manaRef.ValueRW = mana;

                aura.TimeSinceHeal = 0f;
            }

            allies.Dispose();
        }

        struct AllySlot
        {
            public Entity Entity;
            public float2 Pos;
            public float  Missing;
        }
    }
}
