using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ticks the per-Capital craft cycle: consume 3 inputs from the Capital's own treasury, wait CycleDuration, push the output stack back.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct CapitalProductionSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate<CapitalProduction>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            state.Dependency = new CapitalTickJob
            {
                StorageLookup = SystemAPI.GetBufferLookup<InventorySlot>(false),
                Now           = now,
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct CapitalTickJob : IJobEntity
    {
        public BufferLookup<InventorySlot> StorageLookup;
        public float Now;

        public void Execute(Entity entity, in CapitalTag tag, ref CapitalProduction prod)
        {
            if (!StorageLookup.HasBuffer(entity)) return;
            var storage = StorageLookup[entity];

            if (prod.CycleEndsAt > 0f)
            {
                if (Now < prod.CycleEndsAt) return;

                if (prod.OutputAmount > 0)
                    AddItem(ref storage, prod.OutputId, prod.OutputAmount);
                prod.CycleEndsAt = 0f;
                return;
            }

            if (prod.Input1Amount > 0 && !HasItem(in storage, prod.Input1Id, prod.Input1Amount)) return;
            if (prod.Input2Amount > 0 && !HasItem(in storage, prod.Input2Id, prod.Input2Amount)) return;
            if (prod.Input3Amount > 0 && !HasItem(in storage, prod.Input3Id, prod.Input3Amount)) return;

            if (prod.Input1Amount > 0) Consume(ref storage, prod.Input1Id, prod.Input1Amount);
            if (prod.Input2Amount > 0) Consume(ref storage, prod.Input2Id, prod.Input2Amount);
            if (prod.Input3Amount > 0) Consume(ref storage, prod.Input3Id, prod.Input3Amount);

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
