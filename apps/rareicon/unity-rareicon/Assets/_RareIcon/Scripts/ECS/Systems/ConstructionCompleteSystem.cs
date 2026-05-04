using Unity.Burst;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>When a ConstructionSite's materials are all delivered, attach the per-type tag + strip site tracking so production systems pick up. Async ECB via EndSimulationEntityCommandBufferSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct ConstructionCompleteSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<ConstructionSite>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            bool hasEvents = false;
            var events = default(Unity.Collections.NativeList<BuildingEvent>.ParallelWriter);
            if (SystemAPI.HasSingleton<BuildingsDBSingleton>())
            {
                var dbRW = SystemAPI.GetSingletonRW<BuildingsDBSingleton>();
                ref var db = ref dbRW.ValueRW;
                if (db.Events.IsCreated)
                {
                    state.Dependency = JobHandle.CombineDependencies(state.Dependency, db.EventsWriteHandle);
                    events = db.Events.AsParallelWriter();
                    hasEvents = true;

                    var handle = new ConstructionCompleteJob
                    {
                        Ecb       = ecb.AsParallelWriter(),
                        Events    = events,
                        HasEvents = hasEvents,
                    }.ScheduleParallel(state.Dependency);
                    db.EventsWriteHandle = handle;
                    state.Dependency     = handle;
                    return;
                }
            }

            state.Dependency = new ConstructionCompleteJob
            {
                Ecb       = ecb.AsParallelWriter(),
                Events    = events,
                HasEvents = hasEvents,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ConstructionCompleteJob : IJobEntity
    {
        public EntityCommandBuffer.ParallelWriter Ecb;
        public Unity.Collections.NativeList<BuildingEvent>.ParallelWriter Events;
        public bool HasEvents;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in ConstructionSite _,
                     in Building building,
                     in DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < mats.Length; i++)
                if (mats[i].Delivered < mats[i].Needed) return;

            switch (building.Type)
            {
                case BuildingType.Farm:
                    Ecb.AddComponent<FarmTag>(chunkIdx, entity);
                    // Tier 0 Farm → tier 1 Village upgrade path.
                    Ecb.AddComponent(chunkIdx, entity, new BuildingTier { Value = 0 });
                    break;
                case BuildingType.Barracks:
                    Ecb.AddComponent<BarracksTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new BarracksSupplyStatus { IsNeedy = 1 });
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesHealing { Priority = 2 });
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesSleep   { Capacity = 5 });
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesFood    { Priority = 1 });
                    // Tier 0 Barracks → tier 1 Keep / Stables / Guildhall → tier 2 Castle.
                    Ecb.AddComponent(chunkIdx, entity, new BuildingTier { Value = 0 });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingVariant { Value = 0 });
                    break;
                case BuildingType.Tower:
                    Ecb.AddComponent<TowerTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new TerritoryEmitter
                    {
                        Center       = building.RootHex,
                        Radius       = 3,
                        OwnerFaction = building.OwnerFaction,
                    });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingTier { Value = 0 });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingVariant { Value = 0 });
                    break;
                case BuildingType.Wall:
                    Ecb.AddComponent<WallTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new BuildingTier { Value = 0 });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingVariant { Value = 0 });
                    break;
                case BuildingType.Furnace:
                    Ecb.AddComponent<FurnaceTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new BuildingTier { Value = 0 });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingVariant { Value = 0 });
                    break;
                case BuildingType.GoblinCave:
                    Ecb.AddComponent<GoblinCaveTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new GoblinCaveProduction
                    {
                        LastProducedTurn = 0,
                        CadenceTurns     = 1,
                        FoodPerGoblin    = 50,
                        StorageCap       = 200,
                    });
                    Ecb.AddComponent(chunkIdx, entity, new CaveFoodStatus
                    {
                        FoodCount = 0,
                        Capacity  = 200,
                    });
                    Ecb.AddBuffer<GoblinCaveLedger>(chunkIdx, entity);
                    break;
                case BuildingType.Inn:
                    Ecb.AddComponent<InnTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesFood  { Priority = 1 });
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesSleep { Capacity = 5 });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingTier { Value = 0 });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingVariant { Value = 0 });
                    break;
                case BuildingType.Market:
                    Ecb.AddComponent<MarketTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new BuildingTier { Value = 0 });
                    break;
                case BuildingType.Dock:
                    Ecb.AddComponent<DockTag>(chunkIdx, entity);
                    // Boat-build cadence: every 2 turns drain 1 Timber
                    // from Capital, emit a FishingBoat on an adjacent hex.
                    Ecb.AddComponent(chunkIdx, entity, new DockProduction
                    {
                        LastProducedTurn = 0,
                        CadenceTurns     = 2,
                        TimberCost       = 1,
                    });
                    // Passive fishing — outputs 2 Meat every 20s into the
                    // Capital via the existing passive-production pipeline.
                    Ecb.AddComponent(chunkIdx, entity, new PassiveProduction
                    {
                        OutputId      = (ushort)ItemId.Meat,
                        OutputAmount  = 2,
                        CycleEndsAt   = 0f,
                        CycleDuration = 20f,
                    });
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesFood { Priority = 1 });
                    // Manning bonus — DockTenderScanSystem writes 1 while
                    // a Craftsman-intent unit stands on the dock hex,
                    // DockProductionSystem halves the cadence while the
                    // multiplier is 1.
                    Ecb.AddComponent(chunkIdx, entity, new TenderMultiplier { Value = 0f });
                    break;
                case BuildingType.Outpost:
                    Ecb.AddComponent<OutpostTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new TerritoryEmitter
                    {
                        Center       = building.RootHex,
                        Radius       = 5,
                        OwnerFaction = building.OwnerFaction,
                    });
                    Ecb.AddComponent(chunkIdx, entity, new OutpostVolley
                    {
                        CooldownSeconds    = 10f,
                        TimeSinceVolley    = 10f,
                        Range              = 15f,
                        ArrowsPerVolley    = 20,
                        ArrowCost          = 5,
                        SpreadHalfAngleRad = 0.52f,
                        ProjectileSpeed    = 14f,
                        ProjectileLifetime = 3f,
                        DamagePerArrow     = 9f,
                    });
                    Ecb.AddComponent(chunkIdx, entity, new OutpostArrowPool { Stock = 160 });
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesFood    { Priority = 1 });
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesSleep   { Capacity = 10 });
                    Ecb.AddComponent(chunkIdx, entity, new ProvidesHealing { Priority = 1 });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingTier    { Value = 0 });
                    Ecb.AddComponent(chunkIdx, entity, new BuildingVariant { Value = 0 });
                    break;
                case BuildingType.Lumbercamp:
                    Ecb.AddComponent<LumbercampTag>(chunkIdx, entity);
                    Ecb.AddBuffer<LumbercampLedger>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new TenderMultiplier { Value = 0f });
                    var lumberRecipes = Ecb.AddBuffer<ProductionRecipe>(chunkIdx, entity);
                    lumberRecipes.Add(new ProductionRecipe
                    {
                        Output1Id = (ushort)ItemId.Log, Output1Amount = 1,
                        CycleDuration = 3f,
                        CycleEndsAt   = 0f,
                    });
                    var lumberExports = Ecb.AddBuffer<SurplusExport>(chunkIdx, entity);
                    lumberExports.Add(new SurplusExport { ItemId = (ushort)ItemId.Log,    Floor = 8 });
                    lumberExports.Add(new SurplusExport { ItemId = (ushort)ItemId.Timber, Floor = 0 });
                    break;
                case BuildingType.MiningPit:
                    Ecb.AddComponent<MiningPitTag>(chunkIdx, entity);
                    Ecb.AddBuffer<MiningPitLedger>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new TenderMultiplier { Value = 0f });
                    var pitRecipes = Ecb.AddBuffer<ProductionRecipe>(chunkIdx, entity);
                    pitRecipes.Add(new ProductionRecipe
                    {
                        Output1Id = (ushort)ItemId.Stone, Output1Amount = 1,
                        CycleDuration = 3f,
                        CycleEndsAt   = 0f,
                    });
                    var pitExports = Ecb.AddBuffer<SurplusExport>(chunkIdx, entity);
                    pitExports.Add(new SurplusExport { ItemId = (ushort)ItemId.Stone,      Floor = 8 });
                    pitExports.Add(new SurplusExport { ItemId = (ushort)ItemId.StoneBlock, Floor = 0 });
                    break;
            }

            Ecb.AddComponent<NeedsStaffing>(chunkIdx, entity);
            Ecb.RemoveComponent<ConstructionSite>(chunkIdx, entity);
            Ecb.RemoveComponent<ConstructionMaterial>(chunkIdx, entity);

            // Emit ConstructionComplete event so UI / audio / achievement
            // subscribers receive a main-thread MessagePipe notification
            // next Presentation tick. HasEvents gates the ParallelWriter
            // access for the case where BuildingsDBSingleton isn't booted.
            if (HasEvents)
            {
                Events.AddNoResize(new BuildingEvent
                {
                    Kind         = BuildingEventKind.ConstructionComplete,
                    Entity       = entity,
                    Type         = building.Type,
                    RootHex      = building.RootHex,
                    OwnerFaction = building.OwnerFaction,
                });
            }
        }
    }
}
