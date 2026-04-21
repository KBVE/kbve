using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Capital ProductionRecipe ticks (Arrow craft, Compost). Reads CapitalLedger RO to check inputs; enqueues ±BankTransfers so the applier is the sole RW writer. ScheduleParallel — the only per-entity write is ProductionRecipe.CycleEndsAt on the Capital itself, and there's exactly one Capital.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct CapitalProductionSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var q = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<CapitalTag, CapitalLedger, ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(q);
            state.RequireForUpdate<BankTransferQueue>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            state.Dependency = new CapitalProductionJob
            {
                Now   = now,
                Queue = SystemAPI.GetSingleton<BankTransferQueue>().Queue.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(CapitalTag))]
    public partial struct CapitalProductionJob : IJobEntity
    {
        public float Now;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(Entity entity, in DynamicBuffer<CapitalLedger> typedStorage, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(ref Queue, entity, r);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }
                if (!HasInputs(storage, r)) continue;
                EnqueueConsume(ref Queue, entity, r);
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

        static void EnqueueConsume(ref NativeQueue<BankTransfer>.ParallelWriter q, Entity target, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input1Id, Delta = -r.Input1Amount });
            if (r.Input2Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input2Id, Delta = -r.Input2Amount });
            if (r.Input3Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input3Id, Delta = -r.Input3Amount });
        }

        static void EmitOutputs(ref NativeQueue<BankTransfer>.ParallelWriter q, Entity target, in ProductionRecipe r)
        {
            if (r.Output1Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output1Id, Delta =  r.Output1Amount });
            if (r.Output2Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output2Id, Delta =  r.Output2Amount });
            if (r.Output3Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output3Id, Delta =  r.Output3Amount });
        }
    }

    /// <summary>Farm ProductionRecipe ticks. Inputs pull from CapitalLedger (RO) when PullsFromCapital=1 (Compost→Carrot); outputs land in this farm's FarmLedger. Every mutation goes through the BankTransferQueue.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct FarmProductionSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var q = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<FarmTag, FarmLedger, ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(q);
            state.RequireForUpdate<BankTransferQueue>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            Entity capital = SystemAPI.TryGetSingletonEntity<CapitalTag>(out var c) ? c : Entity.Null;

            state.Dependency = new FarmProductionJob
            {
                Now           = now,
                Capital       = capital,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                TenderLookup  = SystemAPI.GetComponentLookup<TenderMultiplier>(true),
                Queue         = SystemAPI.GetSingleton<BankTransferQueue>().Queue.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    public partial struct FarmProductionJob : IJobEntity
    {
        public float  Now;
        public Entity Capital;

        [ReadOnly] public BufferLookup<CapitalLedger>       CapitalLookup;
        [ReadOnly] public ComponentLookup<TenderMultiplier> TenderLookup;

        public NativeQueue<BankTransfer>.ParallelWriter Queue;

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
                    EmitOutputs(ref Queue, entity, r);
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
                EnqueueConsume(ref Queue, inputTarget, r);

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

        static void EnqueueConsume(ref NativeQueue<BankTransfer>.ParallelWriter q, Entity target, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input1Id, Delta = -r.Input1Amount });
            if (r.Input2Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input2Id, Delta = -r.Input2Amount });
            if (r.Input3Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input3Id, Delta = -r.Input3Amount });
        }

        static void EmitOutputs(ref NativeQueue<BankTransfer>.ParallelWriter q, Entity target, in ProductionRecipe r)
        {
            if (r.Output1Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output1Id, Delta =  r.Output1Amount });
            if (r.Output2Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output2Id, Delta =  r.Output2Amount });
            if (r.Output3Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output3Id, Delta =  r.Output3Amount });
        }
    }

    /// <summary>Barracks ProductionRecipe ticks (arrow craft). Inputs from Capital (RO), outputs to this Barracks' BarracksLedger. All mutations through BankTransferQueue.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct BarracksProductionRecipeSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var q = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BarracksTag, BarracksLedger, ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(q);
            state.RequireForUpdate<BankTransferQueue>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            Entity capital = SystemAPI.TryGetSingletonEntity<CapitalTag>(out var c) ? c : Entity.Null;

            state.Dependency = new BarracksProductionRecipeJob
            {
                Now           = now,
                Capital       = capital,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                Queue         = SystemAPI.GetSingleton<BankTransferQueue>().Queue.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    public partial struct BarracksProductionRecipeJob : IJobEntity
    {
        public float  Now;
        public Entity Capital;

        [ReadOnly] public BufferLookup<CapitalLedger> CapitalLookup;

        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(Entity entity, in DynamicBuffer<BarracksLedger> typedStorage, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            var selfStorage = typedStorage.Reinterpret<BankLedgerBase>();
            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(ref Queue, entity, r);
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
                EnqueueConsume(ref Queue, inputTarget, r);
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

        static void EnqueueConsume(ref NativeQueue<BankTransfer>.ParallelWriter q, Entity target, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input1Id, Delta = -r.Input1Amount });
            if (r.Input2Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input2Id, Delta = -r.Input2Amount });
            if (r.Input3Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Input3Id, Delta = -r.Input3Amount });
        }

        static void EmitOutputs(ref NativeQueue<BankTransfer>.ParallelWriter q, Entity target, in ProductionRecipe r)
        {
            if (r.Output1Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output1Id, Delta =  r.Output1Amount });
            if (r.Output2Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output2Id, Delta =  r.Output2Amount });
            if (r.Output3Amount > 0) q.Enqueue(new BankTransfer { Target = target, ItemId = r.Output3Id, Delta =  r.Output3Amount });
        }
    }
}
