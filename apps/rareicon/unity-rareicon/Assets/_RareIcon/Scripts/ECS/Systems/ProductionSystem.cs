using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Data-driven production tick for every building carrying a ProductionRecipe buffer. Each recipe has its own CycleEndsAt, so a building with multiple recipes (Capital: Arrow craft + Leaves+Branches→Compost) runs them in parallel. Inputs pull from self or from the Capital per recipe; outputs always land in self storage (farm surplus drains to Capital via FarmSurplusTransferSystem).</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct ProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            Entity capital = SystemAPI.TryGetSingletonEntity<CapitalTag>(out var c) ? c : Entity.Null;

            state.Dependency = new ProductionJob
            {
                Now          = now,
                Capital      = capital,
                InvLookup    = SystemAPI.GetBufferLookup<InventorySlot>(false),
                TenderLookup = SystemAPI.GetComponentLookup<TenderMultiplier>(true),
            }.Schedule(state.Dependency);
        }
    }

    /// <summary>Per-building recipe tick. Single-threaded .Schedule() because multiple buildings may share the Capital's InventorySlot as their input source — ScheduleParallel would need atomic coordination we don't have.</summary>
    [BurstCompile]
    public partial struct ProductionJob : IJobEntity
    {
        public float  Now;
        public Entity Capital;

        [NativeDisableParallelForRestriction]
        public BufferLookup<InventorySlot> InvLookup;

        [ReadOnly] public ComponentLookup<TenderMultiplier> TenderLookup;

        void Execute(Entity entity, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            if (!InvLookup.HasBuffer(entity)) return;
            var selfStorage = InvLookup[entity];

            float tender = TenderLookup.HasComponent(entity) ? TenderLookup[entity].Value : 0f;

            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];

                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(selfStorage, r);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }

                DynamicBuffer<InventorySlot> inputStore;
                if (r.PullsFromCapital != 0)
                {
                    if (Capital == Entity.Null || entity == Capital) continue;
                    if (!InvLookup.HasBuffer(Capital)) continue;
                    inputStore = InvLookup[Capital];
                }
                else
                {
                    inputStore = selfStorage;
                }

                if (!HasInputs(inputStore, r)) continue;
                ConsumeInputs(inputStore, r);

                float duration = r.CycleDuration * (1f - 0.5f * math.saturate(tender));
                r.CycleEndsAt = Now + math.max(0.1f, duration);
                recipes[i] = r;
            }
        }

        static bool HasInputs(DynamicBuffer<InventorySlot> inv, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0 && Count(inv, r.Input1Id) < r.Input1Amount) return false;
            if (r.Input2Amount > 0 && Count(inv, r.Input2Id) < r.Input2Amount) return false;
            if (r.Input3Amount > 0 && Count(inv, r.Input3Id) < r.Input3Amount) return false;
            return true;
        }

        static void ConsumeInputs(DynamicBuffer<InventorySlot> inv, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0) Take(inv, r.Input1Id, r.Input1Amount);
            if (r.Input2Amount > 0) Take(inv, r.Input2Id, r.Input2Amount);
            if (r.Input3Amount > 0) Take(inv, r.Input3Id, r.Input3Amount);
        }

        static void EmitOutputs(DynamicBuffer<InventorySlot> inv, in ProductionRecipe r)
        {
            if (r.Output1Amount > 0) Add(inv, r.Output1Id, r.Output1Amount);
            if (r.Output2Amount > 0) Add(inv, r.Output2Id, r.Output2Amount);
            if (r.Output3Amount > 0) Add(inv, r.Output3Id, r.Output3Amount);
        }

        static int Count(DynamicBuffer<InventorySlot> inv, ushort itemId)
        {
            int total = 0;
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].ItemId == itemId) total += inv[i].Count;
            return total;
        }

        static void Take(DynamicBuffer<InventorySlot> inv, ushort itemId, ushort amount)
        {
            int remaining = amount;
            for (int i = 0; i < inv.Length && remaining > 0; i++)
            {
                if (inv[i].ItemId != itemId) continue;
                var slot = inv[i];
                int take = math.min(slot.Count, remaining);
                slot.Count = (ushort)(slot.Count - take);
                inv[i] = slot;
                remaining -= take;
            }
        }

        static void Add(DynamicBuffer<InventorySlot> inv, ushort itemId, ushort amount)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId == itemId)
                {
                    var slot = inv[i];
                    slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                    inv[i] = slot;
                    return;
                }
            }
            inv.Add(new InventorySlot { ItemId = itemId, Count = amount });
        }
    }
}
