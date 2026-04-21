using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Builder two-phase transport: on Capital hex, pick up one needed material; on site hex, deliver one matching item and award Construction XP. Shared Capital + site buffers → single-worker Schedule.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial struct BuilderDepositSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;

            state.Dependency = new BuilderDepositJob
            {
                Capital           = capital,
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                PackLookup        = SystemAPI.GetBufferLookup<PackSlot>(false),
                CapitalLookup     = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                MatLookup         = SystemAPI.GetBufferLookup<ConstructionMaterial>(false),
                SiteLookup        = SystemAPI.GetComponentLookup<ConstructionSite>(true),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BuilderDepositJob : IJobEntity
    {
        const ushort XPPerDelivery = 18;

        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>       HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>      HexOccupantLookup;
        [ReadOnly] public ComponentLookup<ConstructionSite> SiteLookup;

        [NativeDisableParallelForRestriction] public BufferLookup<PackSlot>             PackLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<CapitalLedger>        CapitalLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<ConstructionMaterial> MatLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP>           SkillXpLookup;

        void Execute(Entity entity, in JobIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != JobKind.Builder) return;
            if (intent.TargetEntity == Entity.Null) return;
            if (!PackLookup.HasBuffer(entity)) return;

            Entity targetSite = intent.TargetEntity;
            if (!MatLookup.HasBuffer(targetSite)) return;
            if (!SiteLookup.HasComponent(targetSite)) return;

            int2 unitHex  = movement.CurrentHex;
            var unitPack  = PackLookup[entity];
            var siteMats  = MatLookup[targetSite];

            if (IsOnHex(unitHex, SiteLookup[targetSite].RootHex))
            {
                if (TryDeliver(unitPack, siteMats) && SkillXpLookup.HasComponent(entity))
                {
                    var xp = SkillXpLookup[entity];
                    int next = xp.Get(SkillKind.Construction) + XPPerDelivery;
                    xp.Set(SkillKind.Construction, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                    SkillXpLookup[entity] = xp;
                }
                return;
            }

            if (IsOnCapital(unitHex) && !CarriesMatchingMaterial(unitPack, siteMats))
            {
                if (!CapitalLookup.HasBuffer(Capital)) return;
                var capInv = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
                TryPickup(ref capInv, unitPack, siteMats);
            }
        }

        static bool IsOnHex(int2 a, int2 b) => a.x == b.x && a.y == b.y;

        bool IsOnCapital(int2 unitHex)
        {
            if (!HexLookup.TryGetValue(unitHex, out var tile)) return false;
            if (!HexOccupantLookup.HasComponent(tile)) return false;
            return HexOccupantLookup[tile].Building == Capital;
        }

        static bool CarriesMatchingMaterial(DynamicBuffer<PackSlot> pack, DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < pack.Length; i++)
            {
                if (pack[i].Count == 0) continue;
                for (int j = 0; j < mats.Length; j++)
                {
                    if (mats[j].ItemId == pack[i].ItemId && mats[j].Delivered < mats[j].Needed)
                        return true;
                }
            }
            return false;
        }

        static bool TryDeliver(DynamicBuffer<PackSlot> pack, DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < pack.Length; i++)
            {
                if (pack[i].Count == 0) continue;
                for (int j = 0; j < mats.Length; j++)
                {
                    if (mats[j].ItemId != pack[i].ItemId) continue;
                    if (mats[j].Delivered >= mats[j].Needed) continue;

                    var slot = pack[i];
                    slot.Count -= 1;
                    pack[i] = slot;

                    var mat = mats[j];
                    mat.Delivered += 1;
                    mats[j] = mat;
                    return true;
                }
            }
            return false;
        }

        static bool TryPickup(ref DynamicBuffer<BankLedgerBase> capInv,
                              DynamicBuffer<PackSlot> unitPack,
                              DynamicBuffer<ConstructionMaterial> mats)
        {
            bool anyPicked = false;
            for (int j = 0; j < mats.Length; j++)
            {
                if (mats[j].Delivered >= mats[j].Needed) continue;

                ushort needId = mats[j].ItemId;
                int    want   = mats[j].Needed - mats[j].Delivered
                              - CountInUnit(unitPack, needId);
                if (want <= 0) continue;

                for (int i = 0; i < capInv.Length && want > 0; i++)
                {
                    if (capInv[i].ItemId != needId || capInv[i].Count == 0) continue;

                    var capSlot = capInv[i];
                    int take = capSlot.Count < want ? capSlot.Count : want;
                    capSlot.Count = (ushort)(capSlot.Count - take);
                    capInv[i] = capSlot;

                    MergeOrAdd(unitPack, needId, (ushort)take);
                    want     -= take;
                    anyPicked = true;
                }
            }
            return anyPicked;
        }

        static int CountInUnit(in DynamicBuffer<PackSlot> pack, ushort itemId)
        {
            int total = 0;
            for (int i = 0; i < pack.Length; i++)
                if (pack[i].ItemId == itemId) total += pack[i].Count;
            return total;
        }

        static void MergeOrAdd(DynamicBuffer<PackSlot> pack, ushort itemId, ushort amount)
        {
            for (int i = 0; i < pack.Length; i++)
            {
                if (pack[i].ItemId == itemId)
                {
                    var slot = pack[i];
                    slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                    pack[i] = slot;
                    return;
                }
            }
            pack.Add(new PackSlot { ItemId = itemId, Count = amount });
        }
    }
}
