using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Every HealingAura.Period seconds, the caster finds the nearest injured Player-faction ally inside Range and restores HealingAura.Amount HP if it has HealingAura.ManaCost Mana. Pre-pass snapshots ally candidates into a NativeList; Burst heal job iterates casters and writes through ComponentLookup&lt;Health&gt;.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(SpellCastSystem))]
    public partial struct HealingAuraSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<HealingAura>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var allies = new NativeList<AllySlot>(64, Allocator.TempJob);

            var snapshotHandle = new HealCandidateSnapshotJob
            {
                Allies = allies,
            }.Schedule(state.Dependency);

            var healHandle = new HealingAuraJob
            {
                Dt           = SystemAPI.Time.DeltaTime,
                Allies       = allies.AsDeferredJobArray(),
                HealthLookup = SystemAPI.GetComponentLookup<Health>(false),
            }.Schedule(snapshotHandle);

            state.Dependency = allies.Dispose(healHandle);
        }
    }

    public struct AllySlot
    {
        public Entity Entity;
        public float2 Pos;
        public float  Missing;
    }

    [BurstCompile]
    [WithAll(typeof(Faction))]
    public partial struct HealCandidateSnapshotJob : IJobEntity
    {
        public NativeList<AllySlot> Allies;

        void Execute(Entity entity,
                     in Health health,
                     in LocalTransform transform,
                     in Faction faction)
        {
            if (faction.Value != FactionType.Player) return;
            if (health.Value >= health.Max) return;
            Allies.Add(new AllySlot
            {
                Entity  = entity,
                Pos     = new float2(transform.Position.x, transform.Position.y),
                Missing = health.Max - health.Value,
            });
        }
    }

    [BurstCompile]
    public partial struct HealingAuraJob : IJobEntity
    {
        public float Dt;
        [ReadOnly] public NativeArray<AllySlot> Allies;

        [NativeDisableParallelForRestriction]
        public ComponentLookup<Health> HealthLookup;

        void Execute(Entity entity,
                     in LocalTransform transform,
                     in Faction faction,
                     ref HealingAura aura,
                     ref Mana mana)
        {
            if (faction.Value != FactionType.Player) return;

            aura.TimeSinceHeal += Dt;
            if (aura.TimeSinceHeal < aura.Period) return;
            if (mana.Value < aura.ManaCost) return;

            float rangeSq = aura.Range * aura.Range;
            float bestSq  = rangeSq;
            float bestMissing = 0f;
            int   bestIdx = -1;
            float2 myPos  = new float2(transform.Position.x, transform.Position.y);

            for (int i = 0; i < Allies.Length; i++)
            {
                var cand = Allies[i];
                if (cand.Entity == entity) continue;
                float d2 = math.distancesq(myPos, cand.Pos);
                if (d2 > bestSq) continue;
                if (cand.Missing <= bestMissing) continue;
                bestSq     = d2;
                bestMissing = cand.Missing;
                bestIdx    = i;
            }

            if (bestIdx < 0) return;

            var target = Allies[bestIdx];
            if (!HealthLookup.HasComponent(target.Entity)) return;

            var h = HealthLookup[target.Entity];
            h.Value = math.min(h.Max, h.Value + aura.Amount);
            HealthLookup[target.Entity] = h;

            mana.Value        -= aura.ManaCost;
            aura.TimeSinceHeal = 0f;
        }
    }
}
