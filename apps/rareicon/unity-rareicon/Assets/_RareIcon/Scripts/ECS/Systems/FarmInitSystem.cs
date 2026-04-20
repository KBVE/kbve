using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ensures every FarmTag entity carries the default farm composition — Compost → Carrot ProductionRecipe, InventorySlot, SurplusExport list (keep 8 Carrots locally for livestock feed, ship everything else), TenderMultiplier, FarmLivestock buffer. Future recipe selection (Wood → Mushroom, etc.) just appends more ProductionRecipe entries. Burst ISystem: structural work via EndInitializationECB so downstream Simulation systems see the new components the same frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct FarmInitSystem : ISystem
    {
        EntityQuery _needsInit;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _needsInit = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<FarmTag>()
                .WithNone<ProductionRecipe>()
                .Build(ref state);
            state.RequireForUpdate(_needsInit);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndInitializationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new FarmInitJob
            {
                Ecb       = ecb.AsParallelWriter(),
                InvLookup = SystemAPI.GetBufferLookup<InventorySlot>(true),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    [WithNone(typeof(ProductionRecipe))]
    public partial struct FarmInitJob : IJobEntity
    {
        public EntityCommandBuffer.ParallelWriter     Ecb;
        [ReadOnly] public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx)
        {
            if (!InvLookup.HasBuffer(entity))
                Ecb.AddBuffer<InventorySlot>(chunkIdx, entity);

            var recipes = Ecb.AddBuffer<ProductionRecipe>(chunkIdx, entity);
            recipes.Add(new ProductionRecipe
            {
                Input1Id         = (ushort)ItemId.Compost, Input1Amount = 1,
                Output1Id        = (ushort)ItemId.Carrot,  Output1Amount = 1,
                CycleDuration    = 8f,
                CycleEndsAt      = 0f,
                PullsFromCapital = 1,
            });

            var exports = Ecb.AddBuffer<SurplusExport>(chunkIdx, entity);
            exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Carrot, Floor = 8 });
            exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Egg,    Floor = 0 });
            exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Milk,   Floor = 0 });
            exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Wool,   Floor = 0 });
            exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Meat,   Floor = 0 });

            Ecb.AddComponent(chunkIdx, entity, new TenderMultiplier { Value = 0f });
            Ecb.AddBuffer<FarmLivestock>(chunkIdx, entity);
        }
    }
}
