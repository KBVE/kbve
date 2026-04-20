using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains each building's SurplusExport items into the Capital's InventorySlot each tick, respecting the per-item Floor. Parallel — source building's InventorySlot is written directly (per-entity, exclusive), Capital adds queue through PendingItemTransfer so every building can drain in parallel without contending on the Capital buffer. Buildings that want to retain output locally (Barracks arrows until the Floor, Capital itself) omit or tune the SurplusExport buffer.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct BuildingSurplusTransferSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new SurplusTransferJob
            {
                Capital = capital,
                Ecb     = ecb,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct SurplusTransferJob : IJobEntity
    {
        public Entity Capital;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref DynamicBuffer<InventorySlot> storage,
                     in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;

            for (int e = 0; e < exports.Length; e++)
            {
                ushort itemId = exports[e].ItemId;
                ushort floor  = exports[e].Floor;

                int have = 0;
                for (int i = 0; i < storage.Length; i++)
                    if (storage[i].ItemId == itemId) have += storage[i].Count;
                if (have <= floor) continue;

                int move = have - floor;
                int remaining = move;
                for (int i = 0; i < storage.Length && remaining > 0; i++)
                {
                    if (storage[i].ItemId != itemId) continue;
                    var slot = storage[i];
                    int take = math.min(slot.Count, remaining);
                    slot.Count = (ushort)(slot.Count - take);
                    storage[i] = slot;
                    remaining -= take;
                }

                var req = Ecb.CreateEntity(chunkIdx);
                Ecb.AddComponent(chunkIdx, req, new PendingItemTransfer
                {
                    Target = Capital,
                    ItemId = itemId,
                    Delta  = move,
                });
            }
        }
    }
}
