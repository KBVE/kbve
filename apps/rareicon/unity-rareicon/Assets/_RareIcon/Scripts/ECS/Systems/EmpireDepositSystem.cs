using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains a Player-faction unit's pack into Capital via Deposit reservations when standing on a Capital-claimed hex. BanditCoin is withheld whenever any Barracks is below its StorageCapacity — the carrier keeps coins for a Capital→Barracks supply run.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct EmpireDepositSystem : ISystem
    {
        EntityQuery _barracksQuery;

        public void OnCreate(ref SystemState state)
        {
            _barracksQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BarracksTag, StorageCapacity, BarracksLedger>()
                .Build(ref state);
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var barracks = _barracksQuery.ToEntityListAsync(Allocator.TempJob,
                                                            state.Dependency,
                                                            out var barracksHandle);

            var anyUnderstocked = new NativeReference<bool>(Allocator.TempJob);

            var checkHandle = new AnyBarracksUnderstockedJob
            {
                Barracks  = barracks.AsDeferredJobArray(),
                InvLookup = SystemAPI.GetBufferLookup<BarracksLedger>(true),
                CapLookup = SystemAPI.GetComponentLookup<StorageCapacity>(true),
                Result    = anyUnderstocked,
            }.Schedule(barracksHandle);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep = JobHandle.CombineDependencies(checkHandle, db.PipelineHandle);

            var handle = new EmpireDepositJob
            {
                Capital        = capital,
                Tick           = tick,
                Understocked   = anyUnderstocked,
                HexLookup      = hexLookup.Lookup,
                OccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                Reservations   = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency = barracks.Dispose(handle);
            state.Dependency = anyUnderstocked.Dispose(state.Dependency);
        }
    }

    /// <summary>Burst IJob: walks the barracks entity list and sets Result = true if any total Count < StorageCapacity.Total.</summary>
    [BurstCompile]
    public struct AnyBarracksUnderstockedJob : IJob
    {
        [ReadOnly] public NativeArray<Entity>              Barracks;
        [ReadOnly] public BufferLookup<BarracksLedger>     InvLookup;
        [ReadOnly] public ComponentLookup<StorageCapacity> CapLookup;
        public NativeReference<bool>                       Result;

        public void Execute()
        {
            Result.Value = false;
            for (int b = 0; b < Barracks.Length; b++)
            {
                var e = Barracks[b];
                if (!InvLookup.HasBuffer(e) || !CapLookup.HasComponent(e)) continue;
                var storage = InvLookup[e];
                int total = 0;
                for (int i = 0; i < storage.Length; i++) total += storage[i].Count;
                if (total < CapLookup[e].Total) { Result.Value = true; return; }
            }
        }
    }

    [BurstCompile]
    public partial struct EmpireDepositJob : IJobEntity
    {
        public Entity Capital;
        public uint   Tick;
        [ReadOnly] public NativeReference<bool>        Understocked;

        [ReadOnly] public NativeHashMap<int2, Entity>  HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant> OccupantLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity,
                     in UnitMovement movement,
                     in Faction faction,
                     ref DynamicBuffer<PackSlot> pack)
        {
            if (faction.Value != FactionType.Player) return;
            if (pack.Length == 0) return;

            bool hasLoot = false;
            for (int i = 0; i < pack.Length; i++)
                if (pack[i].Count > 0) { hasLoot = true; break; }
            if (!hasLoot) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!OccupantLookup.HasComponent(tile)) return;
            if (OccupantLookup[tile].Building != Capital) return;

            bool anyBarracksUnderstocked = Understocked.Value;

            for (int i = 0; i < pack.Length; i++)
            {
                ushort itemId = pack[i].ItemId;
                ushort count  = pack[i].Count;
                if (itemId == 0 || count == 0) continue;
                if (anyBarracksUnderstocked && itemId == (ushort)ItemId.BanditCoin) continue;

                Reservations.Add(ReservationOps.Key(Capital, itemId), ReservationOps.Deposit(entity, count, Tick));

                var src = pack[i];
                src.Count = 0;
                pack[i] = src;
            }
        }
    }
}
