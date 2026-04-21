using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Executor for ReliefKind.Sleep — on a Capital-claimed hex with Sleep intent, apply SleepingTag and drain Fatigue; remove the tag once rested. Async ECB via EndSimulationEntityCommandBufferSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(ConsumeFoodExecutor))]
    public partial struct SleepExecutor : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new SleepJob
            {
                Dt                = SystemAPI.Time.DeltaTime,
                Capital           = capital,
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                SleepingLookup    = SystemAPI.GetComponentLookup<SleepingTag>(true),
                Ecb               = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct SleepJob : IJobEntity
    {
        const float SleepDrainPerSec = 20f;
        // Wake at 15% of Max — goblin's ~85% rested, matches the "don't over-nap"
        // feel you get from sleeping until mostly-but-not-fully refreshed. Absolute
        // threshold would pin every unit type to the same 1 fatigue no matter their
        // MaxFatigue (goblin 100, knight 110, king 120), which reads as different
        // rested levels per unit; ratio keeps the rested% consistent.
        const float WakeThresholdPct = 0.15f;

        public float  Dt;
        public Entity Capital;

        [Unity.Collections.ReadOnly] public NativeHashMap<int2, Entity>  HexLookup;
        [Unity.Collections.ReadOnly] public ComponentLookup<HexOccupant> HexOccupantLookup;
        [Unity.Collections.ReadOnly] public ComponentLookup<SleepingTag> SleepingLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref Fatigue fatigue,
                     in ReliefIntent intent,
                     in UnitMovement movement)
        {
            bool alreadySleeping = SleepingLookup.HasComponent(entity);
            bool wantsSleep      = intent.Kind == ReliefKind.Sleep;
            bool atCapital       = IsOnCapitalHex(movement.CurrentHex);

            if (wantsSleep && atCapital)
            {
                if (!alreadySleeping) Ecb.AddComponent<SleepingTag>(chunkIdx, entity);

                fatigue.Value = math.max(0f, fatigue.Value - SleepDrainPerSec * Dt);

                if (fatigue.Value <= fatigue.Max * WakeThresholdPct && alreadySleeping)
                    Ecb.RemoveComponent<SleepingTag>(chunkIdx, entity);
                return;
            }

            if (alreadySleeping)
                Ecb.RemoveComponent<SleepingTag>(chunkIdx, entity);
        }

        bool IsOnCapitalHex(int2 hex)
        {
            if (!HexLookup.TryGetValue(hex, out var tile)) return false;
            if (!HexOccupantLookup.HasComponent(tile)) return false;
            return HexOccupantLookup[tile].Building == Capital;
        }
    }
}
