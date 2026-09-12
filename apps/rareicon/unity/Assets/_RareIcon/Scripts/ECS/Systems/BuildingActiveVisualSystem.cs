using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Writes the per-instance BuildingActiveVisual flag each frame based on whatever production component the building carries. HexBuilding.shader reads this via the _BuildingActive per-instance float; includes (HexFurnace for smoke, HexInn for window glow, HexGoblinCave for torches) gate their dynamic details on it so an idle building reads as idle. Reset-then-set with OR semantics: all unified-recipe buildings (Farm / Capital / Barracks) flow through ProductionRecipeActiveJob; legacy FurnaceProduction + PassiveProduction each keep a narrow writer.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(EconomySystemGroup))]
    public partial struct BuildingActiveVisualSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<Building>();
            state.RequireForUpdate<WorldClock>();
        }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            state.Dependency = new ResetBuildingActiveJob()
                .ScheduleParallel(state.Dependency);

            state.Dependency = new FurnaceActiveJob { Now = now }
                .ScheduleParallel(state.Dependency);
            state.Dependency = new PassiveProductionActiveJob { Now = now }
                .ScheduleParallel(state.Dependency);
            state.Dependency = new ProductionRecipeActiveJob { Now = now }
                .ScheduleParallel(state.Dependency);
            state.Dependency = new OutpostActiveJob()
                .ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    partial struct ResetBuildingActiveJob : IJobEntity
    {
        void Execute(ref BuildingActiveVisual vis) => vis.Value = 0f;
    }

    [BurstCompile]
    partial struct FurnaceActiveJob : IJobEntity
    {
        public float Now;

        void Execute(in FurnaceProduction prod, ref BuildingActiveVisual vis)
        {
            if (prod.CycleEndsAt > 0f && prod.CycleEndsAt > Now) vis.Value = 1f;
        }
    }

    [BurstCompile]
    partial struct PassiveProductionActiveJob : IJobEntity
    {
        public float Now;

        void Execute(in PassiveProduction prod, ref BuildingActiveVisual vis)
        {
            if (prod.CycleEndsAt > 0f && prod.CycleEndsAt > Now) vis.Value = 1f;
        }
    }

    [BurstCompile]
    partial struct ProductionRecipeActiveJob : IJobEntity
    {
        public float Now;

        void Execute(in DynamicBuffer<ProductionRecipe> recipes, ref BuildingActiveVisual vis)
        {
            for (int i = 0; i < recipes.Length; i++)
            {
                if (recipes[i].CycleEndsAt > 0f && recipes[i].CycleEndsAt > Now)
                {
                    vis.Value = 1f;
                    return;
                }
            }
        }
    }

    [BurstCompile]
    partial struct OutpostActiveJob : IJobEntity
    {
        void Execute(in OutpostTag _, in EmpireConnected __, ref BuildingActiveVisual vis)
        {
            vis.Value = 1f;
        }
    }
}
