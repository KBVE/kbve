using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Building-side 100:1 raw→bulk rollup. For each building's InventorySlot buffer, single-source items (Log→Timber, Stone→StoneBlock, Arrow→Quiver) drain 100 and emit 1 of their CompressesTo. Pooled items (all food items, shared PoolGroup.Food) are summed and drained proportionally into Meal. Runs single-worker per building via Burst IJobEntity — buffer writes are per-entity, no cross-building contention. Bulk stacks get a fresh Ulid stamped from Unity.Mathematics.Random + elapsed-ms, consistent with INVENTORY.md consolidation semantics.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup), OrderLast = true)]
    public partial struct StorageConsolidatorSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var db)) return;

            long nowMs = (long)(SystemAPI.Time.ElapsedTime * 1000.0);
            uint  seed = (uint)math.max(1, nowMs & 0xFFFFFFFF);

            state.Dependency = new ConsolidateJob
            {
                Db    = db,
                NowMs = nowMs,
                Seed  = seed,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(Building))]
    public partial struct ConsolidateJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs;
        public uint Seed;

        void Execute([EntityIndexInQuery] int eiq, Entity entity, ref DynamicBuffer<InventorySlot> inv)
        {
            var rng = new Unity.Mathematics.Random(Seed ^ (uint)(eiq * 0x9E3779B1u) ^ 1u);

            // Pass 1 — single-source rollup (anything with CompressesTo that
            // isn't in a PoolGroup). 100 raw → 1 bulk, loops until the slot
            // has < ratio remaining.
            for (int i = 0; i < inv.Length; i++)
            {
                var slot = inv[i];
                if (slot.Count == 0) continue;
                if (!Db.TryGet(slot.ItemId, out var def)) continue;
                if (def.CompressesTo == 0 || def.CompressRatio == 0) continue;
                if (def.PoolGroup != PoolGroup.None) continue; // handled by Pass 2
                if (slot.Count < def.CompressRatio) continue;

                int batches = slot.Count / def.CompressRatio;
                int drain   = batches * def.CompressRatio;

                slot.Count = (ushort)(slot.Count - drain);
                inv[i] = slot;

                AddBulk(ref inv, def.CompressesTo, (ushort)batches,
                        UlidFactory.NewUid(ref rng, NowMs));
            }

            // Pass 2 — food pool rollup. Sum every slot whose PoolGroup
            // matches Food, convert floor(total / 100) to Meal, then drain
            // proportionally across pool members in buffer order.
            int foodTotal = 0;
            ushort foodTarget = 0;
            ushort foodRatio  = 100;
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                if (!Db.TryGet(inv[i].ItemId, out var def)) continue;
                if (def.PoolGroup != PoolGroup.Food) continue;
                foodTotal += inv[i].Count;
                if (foodTarget == 0)
                {
                    foodTarget = def.CompressesTo;
                    if (def.CompressRatio > 0) foodRatio = def.CompressRatio;
                }
            }

            if (foodTarget != 0 && foodTotal >= foodRatio)
            {
                int meals = foodTotal / foodRatio;
                int drain = meals * foodRatio;

                // Proportional drain in buffer order.
                int remaining = drain;
                for (int i = 0; i < inv.Length && remaining > 0; i++)
                {
                    if (inv[i].Count == 0) continue;
                    if (!Db.TryGet(inv[i].ItemId, out var d)) continue;
                    if (d.PoolGroup != PoolGroup.Food) continue;

                    int take = inv[i].Count < remaining ? inv[i].Count : remaining;
                    var s = inv[i];
                    s.Count = (ushort)(s.Count - take);
                    inv[i] = s;
                    remaining -= take;
                }

                AddBulk(ref inv, foodTarget, (ushort)meals,
                        UlidFactory.NewUid(ref rng, NowMs));
            }
        }

        static void AddBulk(ref DynamicBuffer<InventorySlot> inv, ushort bulkId, ushort amount, Ulid freshUid)
        {
            // Merge into an existing bulk stack if present so we don't spam
            // a new Uid per consolidator tick. A fresh Uid is still assigned
            // when a brand-new bulk stack is created.
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId != bulkId) continue;
                var s = inv[i];
                int next = s.Count + amount;
                s.Count = (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next);
                inv[i] = s;
                return;
            }
            inv.Add(new InventorySlot { Uid = freshUid, ItemId = bulkId, Count = amount });
        }
    }
}
