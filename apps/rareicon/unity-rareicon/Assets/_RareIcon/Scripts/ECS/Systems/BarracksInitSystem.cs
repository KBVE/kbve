using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Attaches an InventorySlot buffer + BarracksProduction + StorageCapacity + Arrow-recipe ProductionRecipe + SurplusExport to any Barracks that's missing them. One-shot per entity — query filters on BarracksTag WithNone BarracksProduction. Burst ISystem: structural work via EndInitializationECB so downstream Simulation systems see the new components the same frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct BarracksInitSystem : ISystem
    {
        EntityQuery _needsInit;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _needsInit = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BarracksTag>()
                .WithNone<BarracksProduction>()
                .Build(ref state);
            state.RequireForUpdate(_needsInit);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndInitializationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new BarracksInitJob
            {
                Ecb           = ecb.AsParallelWriter(),
                InvLookup     = SystemAPI.GetBufferLookup<InventorySlot>(true),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    [WithNone(typeof(BarracksProduction))]
    public partial struct BarracksInitJob : IJobEntity
    {
        public EntityCommandBuffer.ParallelWriter       Ecb;
        [ReadOnly] public BufferLookup<InventorySlot>   InvLookup;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx)
        {
            if (!InvLookup.HasBuffer(entity))
                Ecb.AddBuffer<InventorySlot>(chunkIdx, entity);

            Ecb.AddComponent(chunkIdx, entity, new BarracksProduction
            {
                LastProducedTurn = 0,
                CadenceTurns     = 1,
                CoinCost         = 20,
                FoodCost         = 20,
            });
            Ecb.AddComponent(chunkIdx, entity, new StorageCapacity { Total = 200 });

            // Arrow craft, same recipe as the Capital. Inputs pulled from the
            // Capital treasury; outputs land in the Barracks' own InventorySlot
            // as a forward arsenal. Anything above the SurplusExport floor of
            // 20 drains back to the Capital via BuildingSurplusTransferSystem
            // so the shooter pool never ends up stranded at the Barracks.
            var recipes = Ecb.AddBuffer<ProductionRecipe>(chunkIdx, entity);
            recipes.Add(new ProductionRecipe
            {
                Input1Id         = (ushort)ItemId.WoodLog,     Input1Amount  = 1,
                Input2Id         = (ushort)ItemId.CactiNeedle, Input2Amount  = 1,
                Input3Id         = (ushort)ItemId.Stone,       Input3Amount  = 1,
                Output1Id        = (ushort)ItemId.Arrow,       Output1Amount = 10,
                CycleDuration    = 18f,
                CycleEndsAt      = 0f,
                PullsFromCapital = 1,
            });

            var exports = Ecb.AddBuffer<SurplusExport>(chunkIdx, entity);
            exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Arrow, Floor = 20 });
        }
    }
}
