using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains a Player-faction unit's inventory into the Capital's storage buffer when standing on a Capital-claimed hex. BanditCoin is withheld whenever any Barracks is below its StorageCapacity — the carrier keeps the coins for a Capital→Barracks supply run instead of cycling them through the central treasury. Parallelized via PendingItemTransfer: per-unit slot zeros happen directly (per-entity write, race-free), Capital adds queue through ECB.ParallelWriter for InventoryTransferApplierSystem to fold in.</summary>
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

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new EmpireDepositJob
            {
                Capital                 = capital,
                AnyBarracksUnderstocked = anyBarracksUnderstocked,
                HexLookup               = hexLookup.Lookup,
                OccupantLookup          = SystemAPI.GetComponentLookup<HexOccupant>(true),
                Ecb                     = ecb,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct EmpireDepositJob : IJobEntity
    {
        public Entity Capital;
        public bool   AnyBarracksUnderstocked;

        [ReadOnly] public NativeHashMap<int2, Entity>  HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant> OccupantLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute([ChunkIndexInQuery] int chunkIdx,
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

            for (int i = 0; i < pack.Length; i++)
            {
                ushort itemId = pack[i].ItemId;
                ushort count  = pack[i].Count;
                if (itemId == 0 || count == 0) continue;
                if (AnyBarracksUnderstocked && itemId == (ushort)ItemId.BanditCoin) continue;

                var t = Ecb.CreateEntity(chunkIdx);
                Ecb.AddComponent(chunkIdx, t, new PendingItemTransfer
                {
                    Target = Capital,
                    ItemId = itemId,
                    Delta  = count,
                });

                var src = pack[i];
                src.Count = 0;
                pack[i] = src;
            }
        }
    }
}
