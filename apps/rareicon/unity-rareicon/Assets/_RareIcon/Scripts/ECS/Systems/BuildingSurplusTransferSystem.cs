using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains each building's SurplusExport items into the Capital's InventorySlot each tick, respecting the per-item Floor. Building-agnostic — any entity with a SurplusExport buffer + InventorySlot participates. Buildings that want to retain their output locally (Barracks arrows as a forward arsenal, Capital itself) simply omit the SurplusExport buffer or that ItemId entry.</summary>
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

            state.Dependency = new SurplusTransferJob
            {
                Capital   = capital,
                InvLookup = SystemAPI.GetBufferLookup<InventorySlot>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct SurplusTransferJob : IJobEntity
    {
        public Entity Capital;
        [Unity.Collections.NativeDisableParallelForRestriction]
        public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, ref DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            if (!InvLookup.HasBuffer(entity)) return;
            if (!InvLookup.HasBuffer(Capital)) return;

            var storage       = InvLookup[entity];
            var capitalStore  = InvLookup[Capital];

            for (int e = 0; e < exports.Length; e++)
            {
                ushort itemId = exports[e].ItemId;
                ushort floor  = exports[e].Floor;

                int have = 0;
                int firstIdx = -1;
                for (int i = 0; i < storage.Length; i++)
                {
                    if (storage[i].ItemId != itemId) continue;
                    have += storage[i].Count;
                    if (firstIdx < 0) firstIdx = i;
                }
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
                AddCapital(capitalStore, itemId, (ushort)move);
            }
        }

        static void AddCapital(DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
        {
            if (amount == 0) return;
            for (int i = 0; i < storage.Length; i++)
            {
                if (storage[i].ItemId == itemId)
                {
                    var slot = storage[i];
                    slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                    storage[i] = slot;
                    return;
                }
            }
            storage.Add(new InventorySlot { ItemId = itemId, Count = amount });
        }
    }
}
