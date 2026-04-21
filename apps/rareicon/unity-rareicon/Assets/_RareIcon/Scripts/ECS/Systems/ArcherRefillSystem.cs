using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    public static class ArcherRefillConfig
    {
        public const ushort QuiverMax = 20;
    }

    /// <summary>Player-faction RangedAttack units standing on a Capital- or Barracks-owned hex pull Arrows from that building's ledger into their PackSlot, up to QuiverMax. Burst ISystem + Schedule — shared Capital/Barracks buffers serialize internally.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial struct ArcherRefillSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            state.Dependency = new ArcherRefillJob
            {
                HexLookup         = hexLookup.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BuildingLookup    = SystemAPI.GetComponentLookup<Building>(true),
                CapitalLookup     = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                BarracksLookup    = SystemAPI.GetBufferLookup<BarracksLedger>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ArcherRefillJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<Unity.Mathematics.int2, Entity> HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant> HexOccupantLookup;
        [ReadOnly] public ComponentLookup<Building>    BuildingLookup;

        [NativeDisableParallelForRestriction] public BufferLookup<CapitalLedger>  CapitalLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<BarracksLedger> BarracksLookup;

        void Execute(in RangedAttack attack, in Faction faction, in UnitMovement movement, ref DynamicBuffer<PackSlot> pack)
        {
            if (faction.Value != FactionType.Player) return;
            byte pt = attack.ProjectileType;
            if (pt != ProjectileType.Arrow && pt != ProjectileType.Bolt) return;

            int carrying = CountOfPack(pack, (ushort)ItemId.Arrow);
            if (carrying >= ArcherRefillConfig.QuiverMax) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out Entity tile)) return;
            if (!HexOccupantLookup.HasComponent(tile)) return;

            Entity building = HexOccupantLookup[tile].Building;
            if (!BuildingLookup.HasComponent(building)) return;
            byte btype = BuildingLookup[building].Type;

            DynamicBuffer<BankLedgerBase> storage;
            if (btype == BuildingType.Capital && CapitalLookup.HasBuffer(building))
                storage = CapitalLookup[building].Reinterpret<BankLedgerBase>();
            else if (btype == BuildingType.Barracks && BarracksLookup.HasBuffer(building))
                storage = BarracksLookup[building].Reinterpret<BankLedgerBase>();
            else return;

            int available = BankLedgerOps.CountOf(storage, (ushort)ItemId.Arrow);
            if (available <= 0) return;

            int room = ArcherRefillConfig.QuiverMax - carrying;
            int transfer = math.min(room, available);
            if (transfer <= 0) return;

            BankLedgerOps.RemoveItem(ref storage, (ushort)ItemId.Arrow, (ushort)transfer);
            AddArrowsPack(ref pack, (ushort)transfer);
        }

        static int CountOfPack(in DynamicBuffer<PackSlot> buf, ushort itemId)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
                if (buf[i].ItemId == itemId) total += buf[i].Count;
            return total;
        }

        static void AddArrowsPack(ref DynamicBuffer<PackSlot> buf, ushort amount)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].ItemId != (ushort)ItemId.Arrow) continue;
                var slot = buf[i];
                slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                buf[i] = slot;
                return;
            }
            buf.Add(new PackSlot { ItemId = (ushort)ItemId.Arrow, Count = amount });
        }
    }
}
