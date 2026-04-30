using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Ticks Capital ProductionRecipes; submits Consume/Produce reservations on the Capital key.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct CapitalProductionSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var q = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<CapitalTag, CapitalLedger, ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(q);
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now  = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            uint  tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new CapitalProductionJob
            {
                Now          = now,
                Tick         = tick,
                Reservations = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    [WithAll(typeof(CapitalTag))]
    public partial struct CapitalProductionJob : IJobEntity
    {
        public float Now;
        public uint  Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in DynamicBuffer<CapitalLedger> typedStorage, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(ref Reservations, entity, r, Tick);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }
                if (!HasInputs(storage, r)) continue;
                EnqueueConsume(ref Reservations, entity, r, Tick);
                r.CycleEndsAt = Now + math.max(0.1f, r.CycleDuration);
                recipes[i] = r;
            }
        }

        static bool HasInputs(in DynamicBuffer<BankLedgerBase> inv, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0 && BankLedgerOps.CountOf(inv, r.Input1Id) < r.Input1Amount) return false;
            if (r.Input2Amount > 0 && BankLedgerOps.CountOf(inv, r.Input2Id) < r.Input2Amount) return false;
            if (r.Input3Amount > 0 && BankLedgerOps.CountOf(inv, r.Input3Id) < r.Input3Amount) return false;
            return true;
        }

        static void EnqueueConsume(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity target, in ProductionRecipe r, uint tick)
        {
            if (r.Input1Amount > 0) res.Add(ReservationOps.Key(target, r.Input1Id), ReservationOps.Consume(target, r.Input1Amount, tick));
            if (r.Input2Amount > 0) res.Add(ReservationOps.Key(target, r.Input2Id), ReservationOps.Consume(target, r.Input2Amount, tick));
            if (r.Input3Amount > 0) res.Add(ReservationOps.Key(target, r.Input3Id), ReservationOps.Consume(target, r.Input3Amount, tick));
        }

        static void EmitOutputs(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity target, in ProductionRecipe r, uint tick)
        {
            if (r.Output1Amount > 0) res.Add(ReservationOps.Key(target, r.Output1Id), ReservationOps.Produce(target, r.Output1Amount, tick));
            if (r.Output2Amount > 0) res.Add(ReservationOps.Key(target, r.Output2Id), ReservationOps.Produce(target, r.Output2Amount, tick));
            if (r.Output3Amount > 0) res.Add(ReservationOps.Key(target, r.Output3Id), ReservationOps.Produce(target, r.Output3Amount, tick));
        }
    }

    /// <summary>Farm ProductionRecipes; inputs may pull from Capital (Consume against Capital key) or self (Consume against farm key). Outputs are Produce against own FarmLedger.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct FarmProductionSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var q = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<FarmTag, FarmLedger, ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(q);
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now  = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            uint  tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);
            Entity capital = SystemAPI.TryGetSingletonEntity<CapitalTag>(out var c) ? c : Entity.Null;

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new FarmProductionJob
            {
                Now           = now,
                Tick          = tick,
                Capital       = capital,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                TenderLookup  = SystemAPI.GetComponentLookup<TenderMultiplier>(true),
                Reservations  = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    public partial struct FarmProductionJob : IJobEntity
    {
        public float  Now;
        public uint   Tick;
        public Entity Capital;

        [ReadOnly] public BufferLookup<CapitalLedger>       CapitalLookup;
        [ReadOnly] public ComponentLookup<TenderMultiplier> TenderLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in DynamicBuffer<FarmLedger> typedStorage, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            var selfStorage = typedStorage.Reinterpret<BankLedgerBase>();
            float tender = TenderLookup.HasComponent(entity) ? TenderLookup[entity].Value : 0f;

            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(ref Reservations, entity, r, Tick);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }

                Entity inputTarget;
                DynamicBuffer<BankLedgerBase> inputStore;
                if (r.PullsFromCapital != 0)
                {
                    if (Capital == Entity.Null || !CapitalLookup.HasBuffer(Capital)) continue;
                    inputTarget = Capital;
                    inputStore  = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
                }
                else
                {
                    inputTarget = entity;
                    inputStore  = selfStorage;
                }

                // Hard-gate on a Farmer tending the farm — no worker means
                // no new cycle starts. Mirrors the Lumbercamp / Mining Pit
                // contract; food is the most important resource so it
                // shouldn't passively flow without an assigned hand.
                // In-flight cycles still finish if the worker walks away
                // mid-cycle (CycleEndsAt > 0 path above), giving the player
                // a grace window to re-staff before output stalls.
                if (tender <= 0f) continue;

                if (!HasInputs(inputStore, r)) continue;
                EnqueueConsume(ref Reservations, inputTarget, r, Tick);

                float duration = r.CycleDuration * (1f - 0.5f * math.saturate(tender));
                r.CycleEndsAt = Now + math.max(0.1f, duration);
                recipes[i] = r;
            }
        }

        static bool HasInputs(in DynamicBuffer<BankLedgerBase> inv, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0 && BankLedgerOps.CountOf(inv, r.Input1Id) < r.Input1Amount) return false;
            if (r.Input2Amount > 0 && BankLedgerOps.CountOf(inv, r.Input2Id) < r.Input2Amount) return false;
            if (r.Input3Amount > 0 && BankLedgerOps.CountOf(inv, r.Input3Id) < r.Input3Amount) return false;
            return true;
        }

        static void EnqueueConsume(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity target, in ProductionRecipe r, uint tick)
        {
            if (r.Input1Amount > 0) res.Add(ReservationOps.Key(target, r.Input1Id), ReservationOps.Consume(target, r.Input1Amount, tick));
            if (r.Input2Amount > 0) res.Add(ReservationOps.Key(target, r.Input2Id), ReservationOps.Consume(target, r.Input2Amount, tick));
            if (r.Input3Amount > 0) res.Add(ReservationOps.Key(target, r.Input3Id), ReservationOps.Consume(target, r.Input3Amount, tick));
        }

        static void EmitOutputs(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity target, in ProductionRecipe r, uint tick)
        {
            if (r.Output1Amount > 0) res.Add(ReservationOps.Key(target, r.Output1Id), ReservationOps.Produce(target, r.Output1Amount, tick));
            if (r.Output2Amount > 0) res.Add(ReservationOps.Key(target, r.Output2Id), ReservationOps.Produce(target, r.Output2Amount, tick));
            if (r.Output3Amount > 0) res.Add(ReservationOps.Key(target, r.Output3Id), ReservationOps.Produce(target, r.Output3Amount, tick));
        }
    }

    /// <summary>Barracks ProductionRecipes (arrow craft); inputs from Capital or self, outputs to own BarracksLedger.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct BarracksProductionRecipeSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var q = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BarracksTag, BarracksLedger, ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(q);
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now  = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            uint  tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);
            Entity capital = SystemAPI.TryGetSingletonEntity<CapitalTag>(out var c) ? c : Entity.Null;

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new BarracksProductionRecipeJob
            {
                Now           = now,
                Tick          = tick,
                Capital       = capital,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                Reservations  = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    public partial struct BarracksProductionRecipeJob : IJobEntity
    {
        public float  Now;
        public uint   Tick;
        public Entity Capital;

        [ReadOnly] public BufferLookup<CapitalLedger> CapitalLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in DynamicBuffer<BarracksLedger> typedStorage, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            var selfStorage = typedStorage.Reinterpret<BankLedgerBase>();
            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(ref Reservations, entity, r, Tick);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }

                Entity inputTarget;
                DynamicBuffer<BankLedgerBase> inputStore;
                if (r.PullsFromCapital != 0)
                {
                    if (Capital == Entity.Null || !CapitalLookup.HasBuffer(Capital)) continue;
                    inputTarget = Capital;
                    inputStore  = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
                }
                else
                {
                    inputTarget = entity;
                    inputStore  = selfStorage;
                }

                if (!HasInputs(inputStore, r)) continue;
                EnqueueConsume(ref Reservations, inputTarget, r, Tick);
                r.CycleEndsAt = Now + math.max(0.1f, r.CycleDuration);
                recipes[i] = r;
            }
        }

        static bool HasInputs(in DynamicBuffer<BankLedgerBase> inv, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0 && BankLedgerOps.CountOf(inv, r.Input1Id) < r.Input1Amount) return false;
            if (r.Input2Amount > 0 && BankLedgerOps.CountOf(inv, r.Input2Id) < r.Input2Amount) return false;
            if (r.Input3Amount > 0 && BankLedgerOps.CountOf(inv, r.Input3Id) < r.Input3Amount) return false;
            return true;
        }

        static void EnqueueConsume(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity target, in ProductionRecipe r, uint tick)
        {
            if (r.Input1Amount > 0) res.Add(ReservationOps.Key(target, r.Input1Id), ReservationOps.Consume(target, r.Input1Amount, tick));
            if (r.Input2Amount > 0) res.Add(ReservationOps.Key(target, r.Input2Id), ReservationOps.Consume(target, r.Input2Amount, tick));
            if (r.Input3Amount > 0) res.Add(ReservationOps.Key(target, r.Input3Id), ReservationOps.Consume(target, r.Input3Amount, tick));
        }

        static void EmitOutputs(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity target, in ProductionRecipe r, uint tick)
        {
            if (r.Output1Amount > 0) res.Add(ReservationOps.Key(target, r.Output1Id), ReservationOps.Produce(target, r.Output1Amount, tick));
            if (r.Output2Amount > 0) res.Add(ReservationOps.Key(target, r.Output2Id), ReservationOps.Produce(target, r.Output2Amount, tick));
            if (r.Output3Amount > 0) res.Add(ReservationOps.Key(target, r.Output3Id), ReservationOps.Produce(target, r.Output3Amount, tick));
        }
    }

    /// <summary>Lumbercamp ProductionRecipes. Hard-gated on a worker: TenderMultiplier &gt; 0 (a Lumberjack on the footprint or ShelteredInside the camp) is required to start a cycle. No inputs — the Forest hex underneath is the resource well. Outputs Produce against own LumbercampLedger.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct LumbercampProductionSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var q = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<LumbercampTag, LumbercampLedger, ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(q);
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now  = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            uint  tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new LumbercampProductionJob
            {
                Now          = now,
                Tick         = tick,
                TenderLookup = SystemAPI.GetComponentLookup<TenderMultiplier>(true),
                Reservations = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    /// <summary>Mining Pit ProductionRecipes. Same shape as Lumbercamp but for Stone (and future ores) from the Sand hex underneath. Tender-gated on a Miner — Phase B shelter path included.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct MiningPitProductionSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var q = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<MiningPitTag, MiningPitLedger, ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(q);
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now  = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            uint  tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new MiningPitProductionJob
            {
                Now          = now,
                Tick         = tick,
                TenderLookup = SystemAPI.GetComponentLookup<TenderMultiplier>(true),
                Reservations = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    [WithAll(typeof(LumbercampTag))]
    public partial struct LumbercampProductionJob : IJobEntity
    {
        public float Now;
        public uint  Tick;

        [ReadOnly] public ComponentLookup<TenderMultiplier> TenderLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            float tender = TenderLookup.HasComponent(entity) ? TenderLookup[entity].Value : 0f;

            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(ref Reservations, entity, r, Tick);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }

                if (tender <= 0f) continue;

                r.CycleEndsAt = Now + math.max(0.1f, r.CycleDuration);
                recipes[i] = r;
            }
        }

        static void EmitOutputs(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity target, in ProductionRecipe r, uint tick)
        {
            if (r.Output1Amount > 0) res.Add(ReservationOps.Key(target, r.Output1Id), ReservationOps.Produce(target, r.Output1Amount, tick));
            if (r.Output2Amount > 0) res.Add(ReservationOps.Key(target, r.Output2Id), ReservationOps.Produce(target, r.Output2Amount, tick));
            if (r.Output3Amount > 0) res.Add(ReservationOps.Key(target, r.Output3Id), ReservationOps.Produce(target, r.Output3Amount, tick));
        }
    }

    [BurstCompile]
    [WithAll(typeof(MiningPitTag))]
    public partial struct MiningPitProductionJob : IJobEntity
    {
        public float Now;
        public uint  Tick;

        [ReadOnly] public ComponentLookup<TenderMultiplier> TenderLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            float tender = TenderLookup.HasComponent(entity) ? TenderLookup[entity].Value : 0f;

            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(ref Reservations, entity, r, Tick);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }

                if (tender <= 0f) continue;

                r.CycleEndsAt = Now + math.max(0.1f, r.CycleDuration);
                recipes[i] = r;
            }
        }

        static void EmitOutputs(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity target, in ProductionRecipe r, uint tick)
        {
            if (r.Output1Amount > 0) res.Add(ReservationOps.Key(target, r.Output1Id), ReservationOps.Produce(target, r.Output1Amount, tick));
            if (r.Output2Amount > 0) res.Add(ReservationOps.Key(target, r.Output2Id), ReservationOps.Produce(target, r.Output2Amount, tick));
            if (r.Output3Amount > 0) res.Add(ReservationOps.Key(target, r.Output3Id), ReservationOps.Produce(target, r.Output3Amount, tick));
        }
    }
}
