using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Executor for ReliefKind.Sleep — on any ProvidesSleep-tagged building footprint with Sleep intent, apply SleepingTag and drain Fatigue; remove the tag once rested. Per-building capacity enforced via a pre-pass sleeper count. Async ECB via EndSimulationEntityCommandBufferSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(ConsumeFoodExecutor))]
    public partial struct SleepExecutor : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookupSingleton)) return;

            var sleeperCounts = new NativeParallelHashMap<Entity, int>(16, Allocator.TempJob);

            var countHandle = new CountSleepersJob
            {
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                SleeperCounts     = sleeperCounts,
            }.Schedule(state.Dependency);

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            uint currentTurn = SystemAPI.HasSingleton<WorldClock>()
                ? SystemAPI.GetSingleton<WorldClock>().TurnIndex
                : 0u;

            var sleepHandle = new SleepJob
            {
                Dt                    = SystemAPI.Time.DeltaTime,
                CurrentTurn           = currentTurn,
                HexLookup             = hexLookupSingleton.Lookup,
                HexOccupantLookup     = SystemAPI.GetComponentLookup<HexOccupant>(true),
                ProvidesSleepLookup   = SystemAPI.GetComponentLookup<ProvidesSleep>(true),
                ProvidesHealingLookup = SystemAPI.GetComponentLookup<ProvidesHealing>(true),
                ProvidesMoraleLookup  = SystemAPI.GetComponentLookup<ProvidesMorale>(true),
                SleeperCounts         = sleeperCounts,
                SleepingLookup        = SystemAPI.GetComponentLookup<SleepingTag>(true),
                HealthLookup          = SystemAPI.GetComponentLookup<Health>(false),
                Ecb                   = ecb.AsParallelWriter(),
            }.ScheduleParallel(countHandle);

            state.Dependency = sleeperCounts.Dispose(sleepHandle);
        }
    }

    [BurstCompile]
    [WithAll(typeof(SleepingTag))]
    public partial struct CountSleepersJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity>    HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>   HexOccupantLookup;

        public NativeParallelHashMap<Entity, int> SleeperCounts;

        void Execute(in UnitMovement movement)
        {
            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!HexOccupantLookup.HasComponent(tile)) return;
            Entity building = HexOccupantLookup[tile].Building;
            if (building == Entity.Null) return;
            if (SleeperCounts.TryGetValue(building, out int c)) SleeperCounts[building] = c + 1;
            else SleeperCounts.TryAdd(building, 1);
        }
    }

    [BurstCompile]
    public partial struct SleepJob : IJobEntity
    {
        const float SleepDrainPerSec       = 20f;
        const float GoblinSleepMultiplier  = 1.75f;
        const float WakeThresholdPct       = 0.15f;
        // Bumped from 2.0 / 2.0 to 3.0 / 3.5 — under the prior rates the
        // Inn heal capacity couldn't keep up with raid-tick damage and
        // the empire bled population during Bandit waves. New numbers:
        // base 3 hp/s, +3.5 per ProvidesHealing.Priority. T0 Inn = 6.5,
        // Tavern = 6.5, Lodge (Pri 2) = 10. Rough double on Lodge.
        const float SleepHealPerSec        = 3f;
        const float HealingScalePerTier    = 3.5f;
        const uint  MoraleBuffDurationT1   = 200;
        const uint  MoraleBuffDurationT2   = 400;
        const sbyte MoraleWorkBonusT1      = 5;
        const sbyte MoraleWorkBonusT2      = 10;

        public float Dt;
        public uint  CurrentTurn;

        [ReadOnly] public NativeHashMap<int2, Entity>        HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>       HexOccupantLookup;
        [ReadOnly] public ComponentLookup<ProvidesSleep>     ProvidesSleepLookup;
        [ReadOnly] public ComponentLookup<ProvidesHealing>   ProvidesHealingLookup;
        [ReadOnly] public ComponentLookup<ProvidesMorale>    ProvidesMoraleLookup;
        [ReadOnly] public NativeParallelHashMap<Entity, int> SleeperCounts;
        [ReadOnly] public ComponentLookup<SleepingTag>       SleepingLookup;

        [NativeDisableParallelForRestriction]
        public ComponentLookup<Health> HealthLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref Fatigue fatigue,
                     in Unit unit,
                     in ReliefIntent intent,
                     in UnitMovement movement)
        {
            bool alreadySleeping = SleepingLookup.HasComponent(entity);
            bool wantsSleep      = intent.Kind == ReliefKind.Sleep;

            Entity building = ResolveBuildingAt(movement.CurrentHex);
            bool atProvider = building != Entity.Null
                           && ProvidesSleepLookup.HasComponent(building);

            if (wantsSleep && atProvider)
            {
                if (!alreadySleeping)
                {
                    int cap = ProvidesSleepLookup[building].Capacity;
                    int current = SleeperCounts.TryGetValue(building, out int c) ? c : 0;
                    if (current >= cap) return;
                    Ecb.AddComponent<SleepingTag>(chunkIdx, entity);
                }

                float drainRate = unit.Type == UnitType.Goblin
                    ? SleepDrainPerSec * GoblinSleepMultiplier
                    : SleepDrainPerSec;
                fatigue.Value = math.max(0f, fatigue.Value - drainRate * Dt);

                if (HealthLookup.HasComponent(entity))
                {
                    var h = HealthLookup[entity];
                    if (h.Value < h.Max)
                    {
                        float healRate = SleepHealPerSec;
                        if (ProvidesHealingLookup.HasComponent(building))
                            healRate += ProvidesHealingLookup[building].Priority * HealingScalePerTier;
                        h.Value = math.min(h.Max, h.Value + healRate * Dt);
                        HealthLookup[entity] = h;
                    }
                }

                if (fatigue.Value <= fatigue.Max * WakeThresholdPct && alreadySleeping)
                {
                    Ecb.RemoveComponent<SleepingTag>(chunkIdx, entity);
                    AttachMoraleBuffIfProvided(chunkIdx, entity, building);
                }
                return;
            }

            if (alreadySleeping)
                Ecb.RemoveComponent<SleepingTag>(chunkIdx, entity);
        }

        void AttachMoraleBuffIfProvided(int chunkIdx, Entity unit, Entity building)
        {
            if (!ProvidesMoraleLookup.HasComponent(building)) return;
            byte mag = ProvidesMoraleLookup[building].Magnitude;
            if (mag == 0) return;
            uint duration = mag == 1 ? MoraleBuffDurationT1 : MoraleBuffDurationT2;
            sbyte bonus   = mag == 1 ? MoraleWorkBonusT1   : MoraleWorkBonusT2;
            Ecb.AddComponent(chunkIdx, unit, new MoraleBuff
            {
                ExpiresAtTurn  = CurrentTurn + duration,
                WorkBonusPct   = bonus,
                CombatBonusPct = bonus,
            });
        }

        Entity ResolveBuildingAt(int2 hex)
        {
            if (!HexLookup.TryGetValue(hex, out var tile)) return Entity.Null;
            if (!HexOccupantLookup.HasComponent(tile)) return Entity.Null;
            return HexOccupantLookup[tile].Building;
        }
    }
}
