using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-farm production loop — pulls inputs from the Capital (common supply), pushes outputs into the farm's own InventorySlot storage so livestock consumption eats them before surplus drains to the Capital.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct FarmProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<InventorySlot>(capital)) return;

            state.Dependency = new FarmTickJob
            {
                Capital     = capital,
                InvLookup   = SystemAPI.GetBufferLookup<InventorySlot>(false),
                Now         = now,
            }.Schedule(state.Dependency);
        }
    }

    /// <summary>Per-farm tick — consumes input from the Capital, deposits output into the farm's own InventorySlot buffer.</summary>
    [BurstCompile]
    public partial struct FarmTickJob : IJobEntity
    {
        public Entity Capital;
        [Unity.Collections.NativeDisableParallelForRestriction]
        public BufferLookup<InventorySlot> InvLookup;
        public float Now;

        public void Execute(Entity farm, in FarmTag tag, ref FarmProduction prod)
        {
            if (!InvLookup.HasBuffer(farm)) return;
            var capitalStorage = InvLookup[Capital];
            var farmStorage    = InvLookup[farm];

            if (prod.CycleEndsAt > 0f)
            {
                if (Now < prod.CycleEndsAt) return;
                Add(ref farmStorage, prod.OutputItemId, prod.OutputAmount);
                prod.CycleEndsAt = 0f;
                return;
            }

            if (!TryConsume(ref capitalStorage, prod.InputItemId, prod.InputAmount)) return;
            float duration = prod.CycleDuration * (1f - 0.5f * Unity.Mathematics.math.saturate(prod.TenderBonus));
            prod.CycleEndsAt = Now + duration;
        }

        static bool TryConsume(ref DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
        {
            for (int i = 0; i < storage.Length; i++)
            {
                if (storage[i].ItemId != itemId) continue;
                if (storage[i].Count < amount) return false;
                var slot = storage[i];
                slot.Count = (ushort)(slot.Count - amount);
                storage[i] = slot;
                return true;
            }
            return false;
        }

        static void Add(ref DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
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
