using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Drives the per-farm production loop on a worker thread.
    ///
    /// State machine per farm — anchored to <see cref="WorldClock"/>:
    ///   • Idle  (CycleEndsAt == 0): try pull <c>InputAmount</c> of
    ///     <c>InputItemId</c> from capital storage. On success start a
    ///     cycle by setting <c>CycleEndsAt = clock.AbsSeconds + Duration</c>.
    ///   • Running (CycleEndsAt > 0): wait until <c>now >= CycleEndsAt</c>,
    ///     then push <c>OutputAmount</c> of <c>OutputItemId</c> into
    ///     capital storage and reset to Idle.
    ///
    /// Reads the WorldClock singleton on the system body (main thread,
    /// pre-schedule), value-captures the float into the job — worker
    /// thread reads its own copy, no shared memory or locks.
    ///
    /// Single capital is the I/O endpoint for v1 — same simplification
    /// CompostingSystem uses. Multiple farms write to the same capital
    /// buffer, so we use Schedule() (single worker), not ScheduleParallel.
    /// </summary>
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

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<InventorySlot>(capital)) return;

            state.Dependency = new FarmTickJob
            {
                Capital       = capital,
                StorageLookup = SystemAPI.GetBufferLookup<InventorySlot>(false),
                Now           = now,
            }.Schedule(state.Dependency);
        }
    }

    /// <summary>Per-farm tick — advances state and brokers item transfer with capital storage.</summary>
    [BurstCompile]
    public partial struct FarmTickJob : IJobEntity
    {
        public Entity Capital;
        public BufferLookup<InventorySlot> StorageLookup;
        public float Now;

        public void Execute(in FarmTag tag, ref FarmProduction prod)
        {
            var storage = StorageLookup[Capital];

            if (prod.CycleEndsAt > 0f)
            {
                // Running cycle — wait for the clock to catch up.
                if (Now < prod.CycleEndsAt) return;

                // Cycle complete — push output to capital storage, reset.
                AddItem(ref storage, prod.OutputItemId, prod.OutputAmount);
                prod.CycleEndsAt = 0f;
                return;
            }

            // Idle — try to start a new cycle. Farmer tender presence halves the duration at full bonus.
            if (!TryConsume(ref storage, prod.InputItemId, prod.InputAmount)) return;
            float duration = prod.CycleDuration * (1f - 0.5f * Unity.Mathematics.math.saturate(prod.TenderBonus));
            prod.CycleEndsAt = Now + duration;
        }

        static bool TryConsume(ref DynamicBuffer<InventorySlot> storage,
                               ushort itemId, ushort amount)
        {
            int idx = -1;
            for (int i = 0; i < storage.Length; i++)
            {
                if (storage[i].ItemId == itemId) { idx = i; break; }
            }
            if (idx < 0) return false;
            if (storage[idx].Count < amount) return false;

            var slot = storage[idx];
            slot.Count = (ushort)(slot.Count - amount);
            storage[idx] = slot;
            return true;
        }

        static void AddItem(ref DynamicBuffer<InventorySlot> storage,
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
            storage.Add(new InventorySlot { ItemId = itemId, Count = amount });
        }
    }
}
