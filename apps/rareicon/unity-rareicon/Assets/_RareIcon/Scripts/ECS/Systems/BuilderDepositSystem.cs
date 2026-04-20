using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Handles Builder two-phase material transport — on Capital hex, grab one needed item; on construction-site hex, deliver one matching item and award Construction XP.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial class BuilderDepositSystem : SystemBase
    {
        const ushort XPPerDelivery = 18;

        protected override void OnUpdate()
        {
            Entity capital = Entity.Null;
            int2   capitalHex = default;
            foreach (var (b, e) in SystemAPI.Query<RefRO<Building>>().WithEntityAccess())
            {
                if (b.ValueRO.Type == BuildingType.Capital)
                {
                    capital    = e;
                    capitalHex = b.ValueRO.RootHex;
                    break;
                }
            }
            if (capital == Entity.Null) return;

            var hexOccupantLookup    = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var invLookup            = SystemAPI.GetBufferLookup<InventorySlot>(isReadOnly: false);
            var matLookup            = SystemAPI.GetBufferLookup<ConstructionMaterial>(isReadOnly: false);
            var siteLookup           = SystemAPI.GetComponentLookup<ConstructionSite>(isReadOnly: true);
            var skillXpLookup        = SystemAPI.GetComponentLookup<SkillXP>(isReadOnly: false);

            foreach (var (intent, movement, entity) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<UnitMovement>>().WithEntityAccess())
            {
                if (intent.ValueRO.Kind != JobKind.Builder) continue;
                if (intent.ValueRO.TargetEntity == Entity.Null) continue;
                if (!invLookup.HasBuffer(entity)) continue;

                Entity targetSite = intent.ValueRO.TargetEntity;
                if (!matLookup.HasBuffer(targetSite)) continue;
                if (!siteLookup.HasComponent(targetSite)) continue;

                int2 unitHex = movement.ValueRO.CurrentHex;
                var unitInv = invLookup[entity];
                var siteMats = matLookup[targetSite];

                // Delivery: at site hex with a matching item.
                if (IsOnHex(unitHex, siteLookup[targetSite].RootHex))
                {
                    if (TryDeliver(unitInv, siteMats))
                    {
                        if (skillXpLookup.HasComponent(entity))
                        {
                            var xp = skillXpLookup[entity];
                            int next = xp.Get(SkillKind.Construction) + XPPerDelivery;
                            xp.Set(SkillKind.Construction, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                            skillXpLookup[entity] = xp;
                        }
                    }
                    continue;
                }

                // Pickup: at Capital with open carry slot + the capital has a needed material.
                if (IsOnCapital(unitHex, capitalHex, hexOccupantLookup, capital) &&
                    !CarriesMatchingMaterial(unitInv, siteMats))
                {
                    var capInv = invLookup[capital];
                    TryPickup(capInv, unitInv, siteMats);
                }
            }
        }

        static bool IsOnHex(int2 a, int2 b) => a.x == b.x && a.y == b.y;

        static bool IsOnCapital(int2 unitHex, int2 capitalRootHex,
                                ComponentLookup<HexOccupant> hexOccupantLookup, Entity capital)
        {
            if (!HexHoverSystem.TryGetHexEntity(unitHex, out var tile)) return false;
            if (!hexOccupantLookup.HasComponent(tile)) return false;
            return hexOccupantLookup[tile].Building == capital;
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
