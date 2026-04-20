using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Ticks any entity carrying a <see cref="PassiveProduction"/>
    /// component — currently only forest-placed Furnaces (free coal
    /// stream from surrounding trees), but the component is generic
    /// so a future Lumber Mill on forest, Quarry on stone, Fishing
    /// Hut on river, etc. each just add the component at spawn time
    /// and inherit the same loop here.
    ///
    /// No input requirement — `CycleEndsAt == 0` means "first tick
    /// hasn't run yet", we initialise it to <c>now + Duration</c>.
    /// Each completed cycle pushes the configured output to capital
    /// storage and re-arms.
    ///
    /// Same WorldClock value-capture pattern as the other production
    /// systems.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct PassiveProductionSystem : ISystem
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

            state.Dependency = new PassiveTickJob
            {
                Capital       = capital,
                StorageLookup = SystemAPI.GetBufferLookup<InventorySlot>(false),
                Now           = now,
            }.Schedule(state.Dependency);
        }
    }

    /// <summary>Per-entity passive-production tick. No inputs, just time.</summary>
    [BurstCompile]
    public partial struct PassiveTickJob : IJobEntity
    {
        public Entity Capital;
        public BufferLookup<InventorySlot> StorageLookup;
        public float Now;

        public void Execute(ref PassiveProduction prod)
        {
            // First-ever tick — arm the timer and bail.
            if (prod.CycleEndsAt == 0f)
            {
                prod.CycleEndsAt = Now + prod.CycleDuration;
                return;
            }

            if (Now < prod.CycleEndsAt) return;

            // Cycle complete — push output, re-arm. Forward-roll the
            // end time by Duration (vs `Now + Duration`) so we don't
            // lose phase if a frame was skipped.
            var storage = StorageLookup[Capital];
            AddItem(ref storage, prod.OutputId, prod.OutputAmount);
            prod.CycleEndsAt = prod.CycleEndsAt + prod.CycleDuration;
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
