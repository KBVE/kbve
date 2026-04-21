using Unity.Burst;
using Unity.Entities;

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

            state.Dependency = new ConstructionCompleteJob
            {
                Ecb = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ConstructionCompleteJob : IJobEntity
    {
        public EntityCommandBuffer.ParallelWriter Ecb;

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
                    break;
                case BuildingType.Barracks:
                    Ecb.AddComponent<BarracksTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new BarracksSupplyStatus { IsNeedy = 1 });
                    break;
                case BuildingType.Furnace:
                    Ecb.AddComponent<FurnaceTag>(chunkIdx, entity);
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
                    break;
                case BuildingType.Outpost:
                    Ecb.AddComponent<OutpostTag>(chunkIdx, entity);
                    Ecb.AddComponent(chunkIdx, entity, new TerritoryEmitter
                    {
                        Center       = building.RootHex,
                        Radius       = 5,
                        OwnerFaction = building.OwnerFaction,
                    });
                    break;
            }

            Ecb.AddComponent<NeedsStaffing>(chunkIdx, entity);
            Ecb.RemoveComponent<ConstructionSite>(chunkIdx, entity);
            Ecb.RemoveComponent<ConstructionMaterial>(chunkIdx, entity);
        }
    }
}
