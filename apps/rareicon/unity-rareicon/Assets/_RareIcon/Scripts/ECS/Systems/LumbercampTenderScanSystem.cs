using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Writes TenderMultiplier.Value = 1 when any Lumberjack-intent unit stands on a Lumbercamp's footprint *or* is ShelteredInside the camp (Phase B garrison path). Otherwise 0 — LumbercampProductionSystem refuses to start a cycle without a worker. Mirrors FarmTenderScanSystem's shape plus the shelter roster.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct LumbercampTenderScanSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var tendedHexes  = new NativeHashSet<int2>(16, Allocator.TempJob);
            var tendingHosts = new NativeHashSet<Entity>(16, Allocator.TempJob);

            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<ProfessionIntent>, RefRO<UnitMovement>>().WithNone<ShelteredInside>())
            {
                if (intent.ValueRO.Kind != ProfessionKind.Lumberjack) continue;
                tendedHexes.Add(movement.ValueRO.CurrentHex);
            }

            foreach (var (intent, sheltered) in
                     SystemAPI.Query<RefRO<ProfessionIntent>, RefRO<ShelteredInside>>())
            {
                if (intent.ValueRO.Kind != ProfessionKind.Lumberjack) continue;
                tendingHosts.Add(sheltered.ValueRO.Host);
            }

            state.Dependency = new LumbercampTenderJob
            {
                TendedHexes  = tendedHexes.AsReadOnly(),
                TendingHosts = tendingHosts.AsReadOnly(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = tendedHexes.Dispose(state.Dependency);
            state.Dependency = tendingHosts.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(LumbercampTag))]
    public partial struct LumbercampTenderJob : IJobEntity
    {
        [ReadOnly] public NativeHashSet<int2>.ReadOnly   TendedHexes;
        [ReadOnly] public NativeHashSet<Entity>.ReadOnly TendingHosts;

        void Execute(Entity entity, in Building building, ref TenderMultiplier tender)
        {
            bool tended = TendedHexes.Contains(building.RootHex) || TendingHosts.Contains(entity);
            tender.Value = tended ? 1f : 0f;
        }
    }

    /// <summary>Writes TenderMultiplier.Value = 1 when any Miner-intent unit stands on a Mining Pit's footprint *or* is ShelteredInside the pit (Phase B garrison path). Otherwise 0 — MiningPitProductionSystem refuses to start a cycle without a worker.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct MiningPitTenderScanSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var tendedHexes  = new NativeHashSet<int2>(16, Allocator.TempJob);
            var tendingHosts = new NativeHashSet<Entity>(16, Allocator.TempJob);

            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<ProfessionIntent>, RefRO<UnitMovement>>().WithNone<ShelteredInside>())
            {
                if (intent.ValueRO.Kind != ProfessionKind.Miner) continue;
                tendedHexes.Add(movement.ValueRO.CurrentHex);
            }

            foreach (var (intent, sheltered) in
                     SystemAPI.Query<RefRO<ProfessionIntent>, RefRO<ShelteredInside>>())
            {
                if (intent.ValueRO.Kind != ProfessionKind.Miner) continue;
                tendingHosts.Add(sheltered.ValueRO.Host);
            }

            state.Dependency = new MiningPitTenderJob
            {
                TendedHexes  = tendedHexes.AsReadOnly(),
                TendingHosts = tendingHosts.AsReadOnly(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = tendedHexes.Dispose(state.Dependency);
            state.Dependency = tendingHosts.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(MiningPitTag))]
    public partial struct MiningPitTenderJob : IJobEntity
    {
        [ReadOnly] public NativeHashSet<int2>.ReadOnly   TendedHexes;
        [ReadOnly] public NativeHashSet<Entity>.ReadOnly TendingHosts;

        void Execute(Entity entity, in Building building, ref TenderMultiplier tender)
        {
            bool tended = TendedHexes.Contains(building.RootHex) || TendingHosts.Contains(entity);
            tender.Value = tended ? 1f : 0f;
        }
    }
}
