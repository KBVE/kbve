using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Runs every Capital ProductionRecipe tick (Arrow craft, Compost). Reads + writes CapitalLedger; no cross-bank pull (PullsFromCapital on Capital is moot since self == Capital). Single-worker Schedule — all recipes hit the one Capital buffer and merging same-ItemId slots serializes.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct CapitalProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            state.Dependency = new CapitalProductionJob
            {
                Now = now,
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(CapitalTag))]
    public partial struct CapitalProductionJob : IJobEntity
    {
        public float Now;

        void Execute(ref DynamicBuffer<CapitalLedger> typedStorage, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    EmitOutputs(ref storage, r);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }
                if (!HasInputs(storage, r)) continue;
                ConsumeInputs(ref storage, r);
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

        static void ConsumeInputs(ref DynamicBuffer<BankLedgerBase> inv, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input1Id, r.Input1Amount);
            if (r.Input2Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input2Id, r.Input2Amount);
            if (r.Input3Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input3Id, r.Input3Amount);
        }

        static void EmitOutputs(ref DynamicBuffer<BankLedgerBase> inv, in ProductionRecipe r)
        {
            if (r.Output1Amount > 0) BankLedgerOps.AddItem(ref inv, r.Output1Id, r.Output1Amount, default);
            if (r.Output2Amount > 0) BankLedgerOps.AddItem(ref inv, r.Output2Id, r.Output2Amount, default);
            if (r.Output3Amount > 0) BankLedgerOps.AddItem(ref inv, r.Output3Id, r.Output3Amount, default);
        }
    }

    /// <summary>Runs Farm ProductionRecipe ticks. Inputs pull from CapitalLedger when PullsFromCapital is set (Compost from Capital → Carrot output into Farm). Outputs land in the Farm's own FarmLedger; BuildingSurplusTransfer drains above-floor amounts back to Capital later in the frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct FarmProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
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
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                TenderLookup  = SystemAPI.GetComponentLookup<TenderMultiplier>(true),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    public partial struct FarmProductionJob : IJobEntity
    {
        public float  Now;
        public Entity Capital;

        [NativeDisableParallelForRestriction]
        public BufferLookup<CapitalLedger> CapitalLookup;

        [ReadOnly] public ComponentLookup<TenderMultiplier> TenderLookup;

        void Execute(Entity entity, ref DynamicBuffer<FarmLedger> typedStorage, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            var selfStorage = typedStorage.Reinterpret<BankLedgerBase>();
            float tender = TenderLookup.HasComponent(entity) ? TenderLookup[entity].Value : 0f;

            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    if (r.Output1Amount > 0) BankLedgerOps.AddItem(ref selfStorage, r.Output1Id, r.Output1Amount, default);
                    if (r.Output2Amount > 0) BankLedgerOps.AddItem(ref selfStorage, r.Output2Id, r.Output2Amount, default);
                    if (r.Output3Amount > 0) BankLedgerOps.AddItem(ref selfStorage, r.Output3Id, r.Output3Amount, default);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }

                if (r.PullsFromCapital != 0)
                {
                    if (Capital == Entity.Null || !CapitalLookup.HasBuffer(Capital)) continue;
                    var cap = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
                    if (!HasInputs(cap, r)) continue;
                    ConsumeInputs(ref cap, r);
                }
                else
                {
                    if (!HasInputs(selfStorage, r)) continue;
                    ConsumeInputs(ref selfStorage, r);
                }

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

        static void ConsumeInputs(ref DynamicBuffer<BankLedgerBase> inv, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input1Id, r.Input1Amount);
            if (r.Input2Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input2Id, r.Input2Amount);
            if (r.Input3Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input3Id, r.Input3Amount);
        }
    }

    /// <summary>Runs Barracks ProductionRecipe ticks. Inputs pull from CapitalLedger (arrow craft recipe), outputs land in BarracksLedger.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct BarracksProductionRecipeSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
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
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    public partial struct BarracksProductionRecipeJob : IJobEntity
    {
        public float  Now;
        public Entity Capital;

        [NativeDisableParallelForRestriction]
        public BufferLookup<CapitalLedger> CapitalLookup;

        void Execute(ref DynamicBuffer<BarracksLedger> typedStorage, ref DynamicBuffer<ProductionRecipe> recipes)
        {
            var selfStorage = typedStorage.Reinterpret<BankLedgerBase>();
            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (r.CycleEndsAt > 0f)
                {
                    if (Now < r.CycleEndsAt) continue;
                    if (r.Output1Amount > 0) BankLedgerOps.AddItem(ref selfStorage, r.Output1Id, r.Output1Amount, default);
                    if (r.Output2Amount > 0) BankLedgerOps.AddItem(ref selfStorage, r.Output2Id, r.Output2Amount, default);
                    if (r.Output3Amount > 0) BankLedgerOps.AddItem(ref selfStorage, r.Output3Id, r.Output3Amount, default);
                    r.CycleEndsAt = 0f;
                    recipes[i] = r;
                    continue;
                }

                if (r.PullsFromCapital != 0)
                {
                    if (Capital == Entity.Null || !CapitalLookup.HasBuffer(Capital)) continue;
                    var cap = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
                    if (!HasInputs(cap, r)) continue;
                    ConsumeInputs(ref cap, r);
                }
                else
                {
                    if (!HasInputs(selfStorage, r)) continue;
                    ConsumeInputs(ref selfStorage, r);
                }

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

        static void ConsumeInputs(ref DynamicBuffer<BankLedgerBase> inv, in ProductionRecipe r)
        {
            if (r.Input1Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input1Id, r.Input1Amount);
            if (r.Input2Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input2Id, r.Input2Amount);
            if (r.Input3Amount > 0) BankLedgerOps.RemoveItem(ref inv, r.Input3Id, r.Input3Amount);
        }
    }
}
