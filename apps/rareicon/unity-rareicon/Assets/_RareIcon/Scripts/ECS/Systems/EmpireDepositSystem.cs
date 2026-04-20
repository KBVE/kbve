using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains a Player-faction unit's inventory into the Capital's storage buffer when standing on a Capital-claimed hex. BanditCoin is withheld whenever any Barracks is below its StorageCapacity — the carrier keeps the coins for a Capital→Barracks supply run instead of cycling them through the central treasury.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct EmpireDepositSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<InventorySlot>(capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            bool anyBarracksUnderstocked = false;
            foreach (var (cap, storage) in
                     SystemAPI.Query<RefRO<StorageCapacity>, DynamicBuffer<InventorySlot>>()
                              .WithAll<BarracksTag>())
            {
                int total = 0;
                for (int i = 0; i < storage.Length; i++) total += storage[i].Count;
                if (total < cap.ValueRO.Total) { anyBarracksUnderstocked = true; break; }
            }

            state.Dependency = new EmpireDepositJob
            {
                Capital                 = capital,
                AnyBarracksUnderstocked = anyBarracksUnderstocked,
                HexLookup               = hexLookup.Lookup,
                OccupantLookup          = SystemAPI.GetComponentLookup<HexOccupant>(true),
                InvLookup               = SystemAPI.GetBufferLookup<InventorySlot>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct EmpireDepositJob : IJobEntity
    {
        public Entity Capital;
        public bool   AnyBarracksUnderstocked;

        [ReadOnly] public NativeHashMap<int2, Entity>  HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant> OccupantLookup;

        [NativeDisableParallelForRestriction]
        public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, in UnitMovement movement, in Faction faction)
        {
            if (faction.Value != FactionType.Player) return;
            if (!InvLookup.HasBuffer(entity)) return;

            var inv = InvLookup[entity];
            if (inv.Length == 0) return;

            bool hasLoot = false;
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].Count > 0) { hasLoot = true; break; }
            if (!hasLoot) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!OccupantLookup.HasComponent(tile)) return;
            if (OccupantLookup[tile].Building != Capital) return;

            var storage = InvLookup[Capital];

            for (int i = 0; i < inv.Length; i++)
            {
                ushort itemId = inv[i].ItemId;
                ushort count  = inv[i].Count;
                if (itemId == 0 || count == 0) continue;
                if (AnyBarracksUnderstocked && itemId == (ushort)ItemId.BanditCoin) continue;

                bool merged = false;
                for (int j = 0; j < storage.Length; j++)
                {
                    if (storage[j].ItemId != itemId) continue;
                    var slot = storage[j];
                    slot.Count = (ushort)math.min(slot.Count + count, ushort.MaxValue);
                    storage[j] = slot;
                    merged = true;
                    break;
                }
                if (!merged) storage.Add(new InventorySlot { ItemId = itemId, Count = count });

                var src = inv[i];
                src.Count = 0;
                inv[i] = src;
            }
        }
    }
}
