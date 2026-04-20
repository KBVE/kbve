using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Chef-intent units standing on the Capital convert one raw wildlife drop → its cooked equivalent per tick; awards Culinary XP. Raw + cooked inventory both live in the Capital's treasury.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BuilderDepositSystem))]
    public partial class CookingSystem : SystemBase
    {
        const ushort XPPerCook = 15;

        protected override void OnUpdate()
        {
            Entity capital = Entity.Null;
            foreach (var (b, e) in SystemAPI.Query<RefRO<Building>>().WithEntityAccess())
            {
                if (b.ValueRO.Type == BuildingType.Capital)
                {
                    capital = e;
                    break;
                }
            }
            if (capital == Entity.Null) return;

            var hexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var invLookup         = SystemAPI.GetBufferLookup<InventorySlot>(isReadOnly: false);
            var skillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(isReadOnly: false);

            if (!invLookup.HasBuffer(capital)) return;

            foreach (var (intent, movement, entity) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<UnitMovement>>().WithEntityAccess())
            {
                if (intent.ValueRO.Kind != JobKind.Chef) continue;
                if (!IsOnCapital(movement.ValueRO.CurrentHex, hexOccupantLookup, capital)) continue;

                var capInv = invLookup[capital];
                if (!TryCookOne(capInv)) continue;

                if (skillXpLookup.HasComponent(entity))
                {
                    var xp = skillXpLookup[entity];
                    int next = xp.Get(SkillKind.Culinary) + XPPerCook;
                    xp.Set(SkillKind.Culinary, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                    skillXpLookup[entity] = xp;
                }
            }
        }

        static bool IsOnCapital(int2 unitHex,
                                ComponentLookup<HexOccupant> hexOccupantLookup, Entity capital)
        {
            if (!HexHoverSystem.TryGetHexEntity(unitHex, out var tile)) return false;
            if (!hexOccupantLookup.HasComponent(tile)) return false;
            return hexOccupantLookup[tile].Building == capital;
        }

        static bool TryCookOne(DynamicBuffer<InventorySlot> inv)
        {
            return TryConvert(inv, (ushort)ItemId.RawChicken, (ushort)ItemId.CookedChicken)
                || TryConvert(inv, (ushort)ItemId.RawMutton,  (ushort)ItemId.CookedMutton)
                || TryConvert(inv, (ushort)ItemId.RawBeef,    (ushort)ItemId.CookedBeef);
        }

        static bool TryConvert(DynamicBuffer<InventorySlot> inv, ushort rawId, ushort cookedId)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId != rawId || inv[i].Count == 0) continue;

                var slot = inv[i];
                slot.Count -= 1;
                inv[i] = slot;

                for (int j = 0; j < inv.Length; j++)
                {
                    if (inv[j].ItemId == cookedId)
                    {
                        var c = inv[j];
                        c.Count = (ushort)math.min(c.Count + 1, ushort.MaxValue);
                        inv[j] = c;
                        return true;
                    }
                }
                inv.Add(new InventorySlot { ItemId = cookedId, Count = 1 });
                return true;
            }
            return false;
        }
    }
}
