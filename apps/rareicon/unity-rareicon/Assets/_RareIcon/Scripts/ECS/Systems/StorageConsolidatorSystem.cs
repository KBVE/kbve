using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>100:1 raw→bulk rollup per-bank. Post-§12 split, each bank type (Capital, Furnace, Farm, Barracks, GoblinCave) has its own ledger, so the consolidator spawns one parallel job per type and each scans only its own entities. All five can run on worker threads concurrently because the ledger types are physically distinct. Reinterpret&lt;BankLedgerBase&gt;() at the boundary feeds the shared ConsolidatorCore algorithm.</summary>
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

            var capH  = new ConsolidateCapitalJob    { Db = db, NowMs = nowMs, Seed = seed }.ScheduleParallel(state.Dependency);
            var furnH = new ConsolidateFurnaceJob    { Db = db, NowMs = nowMs, Seed = seed }.ScheduleParallel(state.Dependency);
            var farmH = new ConsolidateFarmJob       { Db = db, NowMs = nowMs, Seed = seed }.ScheduleParallel(state.Dependency);
            var barrH = new ConsolidateBarracksJob   { Db = db, NowMs = nowMs, Seed = seed }.ScheduleParallel(state.Dependency);
            var caveH = new ConsolidateGoblinCaveJob { Db = db, NowMs = nowMs, Seed = seed }.ScheduleParallel(state.Dependency);

            state.Dependency = JobHandle.CombineDependencies(
                JobHandle.CombineDependencies(capH, furnH, farmH),
                JobHandle.CombineDependencies(barrH, caveH));
        }
    }

    [BurstCompile]
    public partial struct ConsolidateCapitalJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db; public long NowMs; public uint Seed;
        void Execute([EntityIndexInQuery] int eiq, ref DynamicBuffer<CapitalLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), eiq, Seed, NowMs, in Db);
    }

    [BurstCompile]
    public partial struct ConsolidateFurnaceJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db; public long NowMs; public uint Seed;
        void Execute([EntityIndexInQuery] int eiq, ref DynamicBuffer<FurnaceLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), eiq, Seed, NowMs, in Db);
    }

    [BurstCompile]
    public partial struct ConsolidateFarmJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db; public long NowMs; public uint Seed;
        void Execute([EntityIndexInQuery] int eiq, ref DynamicBuffer<FarmLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), eiq, Seed, NowMs, in Db);
    }

    [BurstCompile]
    public partial struct ConsolidateBarracksJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db; public long NowMs; public uint Seed;
        void Execute([EntityIndexInQuery] int eiq, ref DynamicBuffer<BarracksLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), eiq, Seed, NowMs, in Db);
    }

    [BurstCompile]
    public partial struct ConsolidateGoblinCaveJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db; public long NowMs; public uint Seed;
        void Execute([EntityIndexInQuery] int eiq, ref DynamicBuffer<GoblinCaveLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), eiq, Seed, NowMs, in Db);
    }

    internal static class ConsolidatorCore
    {
        public static void Run(DynamicBuffer<BankLedgerBase> inv, int eiq, uint seed, long nowMs, in ItemDBSingleton db)
        {
            var rng = new Unity.Mathematics.Random(seed ^ (uint)(eiq * 0x9E3779B1u) ^ 1u);

            // Pass 1 — single-source rollup.
            for (int i = 0; i < inv.Length; i++)
            {
                var slot = inv[i];
                if (slot.Count == 0) continue;
                if (!db.TryGet(slot.ItemId, out var def)) continue;
                if (def.CompressesTo == 0 || def.CompressRatio == 0) continue;
                if (def.PoolGroup != PoolGroup.None) continue;
                if (slot.Count < def.CompressRatio) continue;

                int batches = slot.Count / def.CompressRatio;
                int drain   = batches * def.CompressRatio;
                slot.Count = (ushort)(slot.Count - drain);
                inv[i] = slot;
                AddBulk(ref inv, def.CompressesTo, (ushort)batches, UlidFactory.NewUid(ref rng, nowMs));
            }

            // Pass 2 — food pool.
            int foodTotal = 0; ushort foodTarget = 0; ushort foodRatio = 100;
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                if (!db.TryGet(inv[i].ItemId, out var def)) continue;
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
                int remaining = drain;
                for (int i = 0; i < inv.Length && remaining > 0; i++)
                {
                    if (inv[i].Count == 0) continue;
                    if (!db.TryGet(inv[i].ItemId, out var d)) continue;
                    if (d.PoolGroup != PoolGroup.Food) continue;
                    int take = inv[i].Count < remaining ? inv[i].Count : remaining;
                    var s = inv[i];
                    s.Count = (ushort)(s.Count - take);
                    inv[i] = s;
                    remaining -= take;
                }
                AddBulk(ref inv, foodTarget, (ushort)meals, UlidFactory.NewUid(ref rng, nowMs));
            }
        }

        static void AddBulk(ref DynamicBuffer<BankLedgerBase> inv, ushort bulkId, ushort amount, Ulid freshUid)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId != bulkId) continue;
                var s = inv[i];
                int next = s.Count + amount;
                s.Count = (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next);
                inv[i] = s;
                return;
            }
            inv.Add(new BankLedgerBase { Uid = freshUid, ItemId = bulkId, Count = amount });
        }
    }
}
