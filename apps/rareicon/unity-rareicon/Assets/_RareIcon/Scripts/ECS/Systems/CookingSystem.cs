using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Chef units on the Capital convert one raw wildlife drop → cooked per tick, awarding Culinary XP. Reads Capital inventory RO, enqueues -raw + +cooked BankTransfers. Applier is the sole RW writer. ScheduleParallel — each chef emits its own transfers.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BuilderDepositSystem))]
    public partial struct CookingSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;
            if (!SystemAPI.TryGetSingleton<BankTransferQueue>(out var qSingleton)) return;

            state.Dependency = new CookingJob
            {
                Capital           = capital,
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                CapitalLookup     = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
                Queue             = qSingleton.Queue.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct CookingJob : IJobEntity
    {
        const ushort XPPerCook = 15;

        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>   HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>  HexOccupantLookup;
        [ReadOnly] public BufferLookup<CapitalLedger>   CapitalLookup;

        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP> SkillXpLookup;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(Entity entity, in JobIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != JobKind.Chef) return;
            if (!IsOnCapital(movement.CurrentHex)) return;
            if (!CapitalLookup.HasBuffer(Capital)) return;

            var inv = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            if (!TryQueueCook(ref Queue, Capital, inv)) return;

            if (SkillXpLookup.HasComponent(entity))
            {
                var xp = SkillXpLookup[entity];
                int next = xp.Get(SkillKind.Culinary) + XPPerCook;
                xp.Set(SkillKind.Culinary, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                SkillXpLookup[entity] = xp;
            }
        }

        bool IsOnCapital(int2 unitHex)
        {
            if (!HexLookup.TryGetValue(unitHex, out var tile)) return false;
            if (!HexOccupantLookup.HasComponent(tile)) return false;
            return HexOccupantLookup[tile].Building == Capital;
        }

        static bool TryQueueCook(ref NativeQueue<BankTransfer>.ParallelWriter q, Entity capital, in DynamicBuffer<BankLedgerBase> inv)
        {
            return TryConvert(ref q, capital, inv, (ushort)ItemId.RawChicken, (ushort)ItemId.CookedChicken)
                || TryConvert(ref q, capital, inv, (ushort)ItemId.RawMutton,  (ushort)ItemId.CookedMutton)
                || TryConvert(ref q, capital, inv, (ushort)ItemId.RawBeef,    (ushort)ItemId.CookedBeef)
                || TryConvert(ref q, capital, inv, (ushort)ItemId.Egg,        (ushort)ItemId.CookedEgg)
                || TryConvert(ref q, capital, inv, (ushort)ItemId.Milk,       (ushort)ItemId.Cheese);
        }

        static bool TryConvert(ref NativeQueue<BankTransfer>.ParallelWriter q, Entity capital, in DynamicBuffer<BankLedgerBase> inv, ushort rawId, ushort cookedId)
        {
            if (BankLedgerOps.CountOf(inv, rawId) == 0) return false;
            q.Enqueue(new BankTransfer { Target = capital, ItemId = rawId,    Delta = -1 });
            q.Enqueue(new BankTransfer { Target = capital, ItemId = cookedId, Delta =  1 });
            return true;
        }
    }
}
