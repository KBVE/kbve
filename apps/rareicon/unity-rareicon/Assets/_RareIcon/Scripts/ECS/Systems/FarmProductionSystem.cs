using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-farm production loop — pulls inputs from the Capital (common supply), pushes outputs into the farm's own FarmStorage so livestock consumption eats them before surplus drains to the Capital.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct FarmProductionSystem : ISystem
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
            if (!SystemAPI.HasBuffer<InventorySlot>(capital)) return;

            state.Dependency = new FarmTickJob
            {
                Capital           = capital,
                CapitalLookup     = SystemAPI.GetBufferLookup<InventorySlot>(false),
                FarmStorageLookup = SystemAPI.GetBufferLookup<FarmStorage>(false),
                Now               = now,
            }.Schedule(state.Dependency);
        }
    }

    /// <summary>Per-farm tick — consumes input from the Capital, deposits output into the farm's own FarmStorage.</summary>
    [BurstCompile]
    public partial struct FarmTickJob : IJobEntity
    {
        public Entity Capital;
        public BufferLookup<InventorySlot> CapitalLookup;
        public BufferLookup<FarmStorage>   FarmStorageLookup;
        public float Now;

        public void Execute(Entity farm, in FarmTag tag, ref FarmProduction prod)
        {
            if (!FarmStorageLookup.HasBuffer(farm)) return;
            var capitalStorage = CapitalLookup[Capital];
            var farmStorage    = FarmStorageLookup[farm];

            if (prod.CycleEndsAt > 0f)
            {
                if (Now < prod.CycleEndsAt) return;

                AddFarm(ref farmStorage, prod.OutputItemId, prod.OutputAmount);
                prod.CycleEndsAt = 0f;
                return;
            }

            if (!TryConsumeCapital(ref capitalStorage, prod.InputItemId, prod.InputAmount)) return;
            float duration = prod.CycleDuration * (1f - 0.5f * Unity.Mathematics.math.saturate(prod.TenderBonus));
            prod.CycleEndsAt = Now + duration;
        }

        static bool TryConsumeCapital(ref DynamicBuffer<InventorySlot> storage,
                                      ushort itemId, ushort amount)
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

        static void AddFarm(ref DynamicBuffer<FarmStorage> storage,
                            ushort itemId, ushort amount)
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
            storage.Add(new FarmStorage { ItemId = itemId, Count = amount });
        }
    }
}
