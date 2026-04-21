using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Chef-intent units on the Capital convert one raw wildlife drop → cooked equivalent per tick, awarding Culinary XP. Reads/writes CapitalLedger (Reinterpret to BankLedgerBase for the shared mutation helpers); single-worker Schedule because all Chefs share the one Capital buffer.</summary>
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
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;

            state.Dependency = new CookingJob
            {
                Capital           = capital,
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                CapitalLookup     = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct CookingJob : IJobEntity
    {
        const ushort XPPerCook = 15;

        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>   HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>  HexOccupantLookup;

        [NativeDisableParallelForRestriction] public BufferLookup<CapitalLedger> CapitalLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP>    SkillXpLookup;

        void Execute(Entity entity, in JobIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != JobKind.Chef) return;
            if (!IsOnCapital(movement.CurrentHex)) return;
            if (!CapitalLookup.HasBuffer(Capital)) return;

            var capInv = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            if (!TryCookOne(ref capInv)) return;

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

        static bool TryCookOne(ref DynamicBuffer<BankLedgerBase> inv)
        {
            return TryConvert(ref inv, (ushort)ItemId.RawChicken, (ushort)ItemId.CookedChicken)
                || TryConvert(ref inv, (ushort)ItemId.RawMutton,  (ushort)ItemId.CookedMutton)
                || TryConvert(ref inv, (ushort)ItemId.RawBeef,    (ushort)ItemId.CookedBeef)
                || TryConvert(ref inv, (ushort)ItemId.Egg,        (ushort)ItemId.CookedEgg)
                || TryConvert(ref inv, (ushort)ItemId.Milk,       (ushort)ItemId.Cheese);
        }

        static bool TryConvert(ref DynamicBuffer<BankLedgerBase> inv, ushort rawId, ushort cookedId)
        {
            if (BankLedgerOps.RemoveItem(ref inv, rawId, 1) == 0) return false;
            BankLedgerOps.AddItem(ref inv, cookedId, 1, default);
            return true;
        }
    }
}
