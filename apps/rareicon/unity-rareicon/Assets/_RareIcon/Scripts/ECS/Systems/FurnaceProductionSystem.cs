using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Drives the per-furnace active cycle on a worker thread. Mirrors
    /// <see cref="FarmProductionSystem"/> but supports up to 2 inputs and
    /// 3 outputs per recipe (e.g. Wood + Sand → Coal + Ash + Glass on
    /// sand placement). Forest furnaces also carry a
    /// <see cref="PassiveProduction"/> component which
    /// <see cref="PassiveProductionSystem"/> ticks independently.
    ///
    /// Timing anchored to <see cref="WorldClock"/>.AbsSeconds via
    /// value-capture into the job — no per-system delta accumulator.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct FurnaceProductionSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) { }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<InventorySlot>(capital)) return;

            state.Dependency = new FurnaceTickJob
            {
                Capital       = capital,
                StorageLookup = SystemAPI.GetBufferLookup<InventorySlot>(false),
                Now           = now,
            }.Schedule(state.Dependency);
        }
    }

    /// <summary>Per-furnace active-recipe tick. Runs on a worker thread.</summary>
    [BurstCompile]
    public partial struct FurnaceTickJob : IJobEntity
    {
        public Entity Capital;
        public BufferLookup<InventorySlot> StorageLookup;
        public float Now;

        public void Execute(in FurnaceTag tag, ref FurnaceProduction prod)
        {
            var storage = StorageLookup[Capital];

            if (prod.CycleEndsAt > 0f)
            {
                if (Now < prod.CycleEndsAt) return;

                // Cycle complete — push outputs (skip slots with amount=0).
                if (prod.Output1Amount > 0) AddItem(ref storage, prod.Output1Id, prod.Output1Amount);
                if (prod.Output2Amount > 0) AddItem(ref storage, prod.Output2Id, prod.Output2Amount);
                if (prod.Output3Amount > 0) AddItem(ref storage, prod.Output3Id, prod.Output3Amount);
                prod.CycleEndsAt = 0f;
                return;
            }

            // Idle — both inputs must be available before we consume EITHER.
            // Otherwise a partial pull on the first input could strand it
            // when the second one isn't there.
            if (prod.Input1Amount > 0 && !HasItem(in storage, prod.Input1Id, prod.Input1Amount)) return;
            if (prod.Input2Amount > 0 && !HasItem(in storage, prod.Input2Id, prod.Input2Amount)) return;

            if (prod.Input1Amount > 0) Consume(ref storage, prod.Input1Id, prod.Input1Amount);
            if (prod.Input2Amount > 0) Consume(ref storage, prod.Input2Id, prod.Input2Amount);

            prod.CycleEndsAt = Now + prod.CycleDuration;
        }

        static bool HasItem(in DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
        {
            for (int i = 0; i < storage.Length; i++)
            {
                if (storage[i].ItemId == itemId && storage[i].Count >= amount) return true;
            }
            return false;
        }

        static void Consume(ref DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
        {
            for (int i = 0; i < storage.Length; i++)
            {
                if (storage[i].ItemId == itemId)
                {
                    var slot = storage[i];
                    slot.Count = (ushort)(slot.Count - amount);
                    storage[i] = slot;
                    return;
                }
            }
        }

        static void AddItem(ref DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
        {
            for (int i = 0; i < storage.Length; i++)
            {
                if (storage[i].ItemId == itemId)
                {
                    var slot = storage[i];
                    slot.Count = (ushort)(slot.Count + amount);
                    storage[i] = slot;
                    return;
                }
            }
            storage.Add(new InventorySlot { ItemId = itemId, Count = amount });
        }
    }
}
