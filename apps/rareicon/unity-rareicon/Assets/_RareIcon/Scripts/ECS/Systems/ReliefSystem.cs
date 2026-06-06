using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Scores unmet needs (Hunger, Fatigue, Health) and writes a single ReliefIntent per unit; executors react to Kind.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial struct ReliefSystem : ISystem
    {
        public const float HungerTrigger  = 0.70f;
        public const float FatigueTrigger = 0.75f;
        public const float HealthTrigger  = 0.40f;

        public const float HungerExit  = 0.40f;
        public const float FatigueExit = 0.40f;
        public const float HealthLossExit = 0.15f;

        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var hungerLookup  = SystemAPI.GetComponentLookup<Hunger>(isReadOnly: true);
            var fatigueLookup = SystemAPI.GetComponentLookup<Fatigue>(isReadOnly: true);
            var healthLookup  = SystemAPI.GetComponentLookup<Health>(isReadOnly: true);

            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            new ScoreReliefJob
            {
                HungerLookup  = hungerLookup,
                FatigueLookup = fatigueLookup,
                HealthLookup  = healthLookup,
                NowTick       = nowTick,
            }.ScheduleParallel();
        }
    }

    [BurstCompile]
    public partial struct ScoreReliefJob : IJobEntity
    {
        [Unity.Collections.ReadOnly] public ComponentLookup<Hunger>  HungerLookup;
        [Unity.Collections.ReadOnly] public ComponentLookup<Fatigue> FatigueLookup;
        [Unity.Collections.ReadOnly] public ComponentLookup<Health>  HealthLookup;

        public uint NowTick;

        void Execute(Entity entity, in Faction faction, ref ReliefIntent intent)
        {
            if (faction.Value != FactionType.Player)
            {
                intent.Kind    = ReliefKind.None;
                intent.Urgency = 0f;
                return;
            }

            float hungerPct  = 0f;
            float fatiguePct = 0f;
            float healthLoss = 0f;

            if (HungerLookup.HasComponent(entity))
            {
                var h = HungerLookup[entity];
                hungerPct = h.Max > 0f ? math.saturate(h.Value / h.Max) : 0f;
            }
            if (FatigueLookup.HasComponent(entity))
            {
                var f = FatigueLookup[entity];
                fatiguePct = f.Max > 0f ? math.saturate(f.Value / f.Max) : 0f;
            }
            if (HealthLookup.HasComponent(entity))
            {
                var h = HealthLookup[entity];
                healthLoss = h.Max > 0f ? math.saturate(1f - h.Value / h.Max) : 0f;
            }

            byte prev = intent.Kind;
            bool eatActive   = (prev == ReliefKind.Eat   && hungerPct  > ReliefSystem.HungerExit)
                             || hungerPct  > ReliefSystem.HungerTrigger;
            bool sleepActive = (prev == ReliefKind.Sleep && fatiguePct > ReliefSystem.FatigueExit)
                             || fatiguePct > ReliefSystem.FatigueTrigger;
            bool healActive  = (prev == ReliefKind.Heal  && healthLoss > ReliefSystem.HealthLossExit)
                             || healthLoss > (1f - ReliefSystem.HealthTrigger);

            byte  bestKind    = ReliefKind.None;
            float bestUrgency = 0f;

            if (eatActive && hungerPct > bestUrgency)
            {
                bestKind    = ReliefKind.Eat;
                bestUrgency = hungerPct;
            }
            if (sleepActive && fatiguePct > bestUrgency)
            {
                bestKind    = ReliefKind.Sleep;
                bestUrgency = fatiguePct;
            }
            if (healActive && healthLoss > bestUrgency)
            {
                bestKind    = ReliefKind.Heal;
                bestUrgency = healthLoss;
            }

            if (hungerPct >= 1.0f)
            {
                bestKind    = ReliefKind.Eat;
                bestUrgency = 2.0f;
            }

            if (bestKind != ReliefKind.None && prev == ReliefKind.None)
                intent.StartTick = NowTick;
            else if (bestKind == ReliefKind.None)
                intent.StartTick = 0u;

            intent.Kind    = bestKind;
            intent.Urgency = bestUrgency;
        }
    }
}
