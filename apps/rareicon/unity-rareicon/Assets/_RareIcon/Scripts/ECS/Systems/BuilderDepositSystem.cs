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
            Entity capital = Entity.Null;
            foreach (var (b, e) in SystemAPI.Query<RefRO<Building>>().WithEntityAccess())
            {
                if (b.ValueRO.Type == BuildingType.Capital) { capital = e; break; }
            }
            if (capital == Entity.Null) return;
            if (!HexHoverSystem.HexLookup.IsCreated) return;

            state.Dependency = new BuilderDepositJob
            {
                Capital           = capital,
                HexLookup         = HexHoverSystem.HexLookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                InvLookup         = SystemAPI.GetBufferLookup<InventorySlot>(false),
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

        [NativeDisableParallelForRestriction] public BufferLookup<InventorySlot>        InvLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<ConstructionMaterial> MatLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP>           SkillXpLookup;

        void Execute(Entity entity, in JobIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != JobKind.Builder) return;
            if (intent.TargetEntity == Entity.Null) return;
            if (!InvLookup.HasBuffer(entity)) return;

            Entity targetSite = intent.TargetEntity;
            if (!MatLookup.HasBuffer(targetSite)) return;
            if (!SiteLookup.HasComponent(targetSite)) return;

            int2 unitHex = movement.CurrentHex;
            var unitInv  = InvLookup[entity];
            var siteMats = MatLookup[targetSite];

            if (IsOnHex(unitHex, SiteLookup[targetSite].RootHex))
            {
                if (TryDeliver(unitInv, siteMats) && SkillXpLookup.HasComponent(entity))
                {
                    var xp = SkillXpLookup[entity];
                    int next = xp.Get(SkillKind.Construction) + XPPerDelivery;
                    xp.Set(SkillKind.Construction, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                    SkillXpLookup[entity] = xp;
                }
                return;
            }

            if (IsOnCapital(unitHex) && !CarriesMatchingMaterial(unitInv, siteMats))
            {
                var capInv = InvLookup[Capital];
                TryPickup(capInv, unitInv, siteMats);
            }
        }

        static bool IsOnHex(int2 a, int2 b) => a.x == b.x && a.y == b.y;

        bool IsOnCapital(int2 unitHex)
        {
            if (!HexLookup.TryGetValue(unitHex, out var tile)) return false;
            if (!HexOccupantLookup.HasComponent(tile)) return false;
            return HexOccupantLookup[tile].Building == Capital;
        }

        static bool CarriesMatchingMaterial(DynamicBuffer<InventorySlot> inv, DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                for (int j = 0; j < mats.Length; j++)
                {
                    if (mats[j].ItemId == inv[i].ItemId && mats[j].Delivered < mats[j].Needed)
                        return true;
                }
            }
            return false;
        }

        static bool TryDeliver(DynamicBuffer<InventorySlot> inv, DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                for (int j = 0; j < mats.Length; j++)
                {
                    if (mats[j].ItemId != inv[i].ItemId) continue;
                    if (mats[j].Delivered >= mats[j].Needed) continue;

                    var slot = inv[i];
                    slot.Count -= 1;
                    inv[i] = slot;

                    var mat = mats[j];
                    mat.Delivered += 1;
                    mats[j] = mat;
                    return true;
                }
            }
            return false;
        }

        static bool TryPickup(DynamicBuffer<InventorySlot> capInv,
                              DynamicBuffer<InventorySlot> unitInv,
                              DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int j = 0; j < mats.Length; j++)
            {
                if (mats[j].Delivered >= mats[j].Needed) continue;

                ushort needId = mats[j].ItemId;
                for (int i = 0; i < capInv.Length; i++)
                {
                    if (capInv[i].ItemId != needId || capInv[i].Count == 0) continue;

                    var capSlot = capInv[i];
                    capSlot.Count -= 1;
                    capInv[i] = capSlot;

                    MergeOrAdd(unitInv, needId, 1);
                    return true;
                }
            }
            return false;
        }

        static void MergeOrAdd(DynamicBuffer<InventorySlot> inv, ushort itemId, ushort amount)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId == itemId)
                {
                    var slot = inv[i];
                    slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                    inv[i] = slot;
                    return;
                }
            }
            inv.Add(new InventorySlot { ItemId = itemId, Count = amount });
        }
    }
}
