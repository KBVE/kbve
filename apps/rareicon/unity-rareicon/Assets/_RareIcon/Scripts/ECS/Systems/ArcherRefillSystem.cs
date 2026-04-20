using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    public static class ArcherRefillConfig
    {
        public const ushort QuiverMax = 20;
    }

    /// <summary>Player-faction RangedAttack units standing on a Capital- or Barracks-owned hex pull Arrows from that building's storage up to ArcherRefillConfig.QuiverMax.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial class ArcherRefillSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            CompleteDependency();

            var hexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true);
            var buildingLookup    = SystemAPI.GetComponentLookup<Building>(true);
            var invLookup         = SystemAPI.GetBufferLookup<InventorySlot>(false);

            foreach (var (attack, faction, movement, inv) in
                     SystemAPI.Query<
                         RefRO<RangedAttack>,
                         RefRO<Faction>,
                         RefRO<UnitMovement>,
                         DynamicBuffer<InventorySlot>>())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                byte pt = attack.ValueRO.ProjectileType;
                if (pt != ProjectileType.Arrow && pt != ProjectileType.Bolt) continue;

                int carrying = CountOf(inv, (ushort)ItemId.Arrow);
                if (carrying >= ArcherRefillConfig.QuiverMax) continue;

                if (!HexHoverSystem.TryGetHexEntity(movement.ValueRO.CurrentHex, out Entity tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;

                Entity building = hexOccupantLookup[tile].Building;
                if (!buildingLookup.HasComponent(building)) continue;
                byte btype = buildingLookup[building].Type;
                if (btype != BuildingType.Capital && btype != BuildingType.Barracks) continue;
                if (!invLookup.HasBuffer(building)) continue;

                var storage = invLookup[building];
                int available = CountOf(storage, (ushort)ItemId.Arrow);
                if (available <= 0) continue;

                int room = ArcherRefillConfig.QuiverMax - carrying;
                int transfer = math.min(room, available);
                if (transfer <= 0) continue;

                Consume(storage, (ushort)ItemId.Arrow, (ushort)transfer);
                AddArrows(inv, (ushort)transfer);
            }
        }

        static int CountOf(DynamicBuffer<InventorySlot> buf, ushort itemId)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
                if (buf[i].ItemId == itemId) total += buf[i].Count;
            return total;
        }

        static void Consume(DynamicBuffer<InventorySlot> buf, ushort itemId, ushort amount)
        {
            int remaining = amount;
            for (int i = 0; i < buf.Length && remaining > 0; i++)
            {
                if (buf[i].ItemId != itemId) continue;
                var slot = buf[i];
                int take = slot.Count < remaining ? slot.Count : remaining;
                slot.Count = (ushort)(slot.Count - take);
                buf[i] = slot;
                remaining -= take;
            }
        }

        static void AddArrows(DynamicBuffer<InventorySlot> buf, ushort amount)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].ItemId != (ushort)ItemId.Arrow) continue;
                var slot = buf[i];
                slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                buf[i] = slot;
                return;
            }
            buf.Add(new InventorySlot { ItemId = (ushort)ItemId.Arrow, Count = amount });
        }
    }
}
