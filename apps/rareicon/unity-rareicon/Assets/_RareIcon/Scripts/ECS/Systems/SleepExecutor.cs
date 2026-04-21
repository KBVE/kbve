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
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;

            var sleeperCounts = new NativeParallelHashMap<Entity, int>(16, Allocator.TempJob);

            var countHandle = new CountSleepersJob
            {
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                SleeperCounts     = sleeperCounts,
            }.Schedule(state.Dependency);

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            var sleepHandle = new SleepJob
            {
                Dt                  = SystemAPI.Time.DeltaTime,
                HexLookup           = hexLookupSingleton.Lookup,
                HexOccupantLookup   = SystemAPI.GetComponentLookup<HexOccupant>(true),
                ProvidesSleepLookup = SystemAPI.GetComponentLookup<ProvidesSleep>(true),
                SleeperCounts       = sleeperCounts,
                SleepingLookup      = SystemAPI.GetComponentLookup<SleepingTag>(true),
                Ecb                 = ecb.AsParallelWriter(),
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
        const float SleepDrainPerSec      = 20f;
        const float GoblinSleepMultiplier = 1.75f;
        const float WakeThresholdPct      = 0.15f;

        public float Dt;

        [ReadOnly] public NativeHashMap<int2, Entity>     HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>    HexOccupantLookup;
        [ReadOnly] public ComponentLookup<ProvidesSleep>  ProvidesSleepLookup;
        [ReadOnly] public NativeParallelHashMap<Entity, int> SleeperCounts;
        [ReadOnly] public ComponentLookup<SleepingTag>    SleepingLookup;

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

                if (fatigue.Value <= fatigue.Max * WakeThresholdPct && alreadySleeping)
                    Ecb.RemoveComponent<SleepingTag>(chunkIdx, entity);
                return;
            }

            if (alreadySleeping)
                Ecb.RemoveComponent<SleepingTag>(chunkIdx, entity);
        }

        Entity ResolveBuildingAt(int2 hex)
        {
            if (!HexLookup.TryGetValue(hex, out var tile)) return Entity.Null;
            if (!HexOccupantLookup.HasComponent(tile)) return Entity.Null;
            return HexOccupantLookup[tile].Building;
        }
    }
}
