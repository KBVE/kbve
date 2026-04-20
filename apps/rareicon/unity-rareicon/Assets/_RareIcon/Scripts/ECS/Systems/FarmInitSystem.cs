using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ensures every FarmTag entity carries a default Compost → Carrot ProductionRecipe + InventorySlot + StorageReserve { Carrot, 8 } + TenderMultiplier + FarmLivestock buffer. Future recipe selection (Wood→Mushroom, etc.) just appends more ProductionRecipe entries.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class FarmInitSystem : SystemBase
    {
        EntityQuery _needsInit;

        protected override void OnCreate()
        {
            _needsInit = GetEntityQuery(
                ComponentType.ReadOnly<FarmTag>(),
                ComponentType.Exclude<ProductionRecipe>());
        }

        protected override void OnUpdate()
        {
            if (_needsInit.IsEmpty) return;

            var arr = _needsInit.ToEntityArray(Allocator.Temp);
            try
            {
                for (int i = 0; i < arr.Length; i++)
                {
                    var e = arr[i];
                    if (!EntityManager.HasBuffer<InventorySlot>(e))
                        EntityManager.AddBuffer<InventorySlot>(e);

                    var recipes = EntityManager.AddBuffer<ProductionRecipe>(e);
                    recipes.Add(new ProductionRecipe
                    {
                        Input1Id         = (ushort)ItemId.Compost, Input1Amount = 1,
                        Output1Id        = (ushort)ItemId.Carrot,  Output1Amount = 1,
                        CycleDuration    = 8f,
                        CycleEndsAt      = 0f,
                        PullsFromCapital = 1,
                    });

                    var reserves = EntityManager.AddBuffer<StorageReserve>(e);
                    reserves.Add(new StorageReserve { ItemId = (ushort)ItemId.Carrot, Reserve = 8 });

                    EntityManager.AddComponentData(e, new TenderMultiplier { Value = 0f });
                    EntityManager.AddBuffer<FarmLivestock>(e);
                }
            }
            finally
            {
                arr.Dispose();
            }
        }
    }
}
