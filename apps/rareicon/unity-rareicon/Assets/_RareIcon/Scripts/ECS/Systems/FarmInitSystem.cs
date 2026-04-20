using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ensures every FarmTag entity carries the default farm composition — Compost → Carrot ProductionRecipe, InventorySlot, SurplusExport list (keep 8 Carrots locally for livestock feed, ship everything else), TenderMultiplier, FarmLivestock buffer. Future recipe selection (Wood → Mushroom, etc.) just appends more ProductionRecipe entries.</summary>
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

                    var exports = EntityManager.AddBuffer<SurplusExport>(e);
                    exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Carrot, Floor = 8 });
                    exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Egg,    Floor = 0 });
                    exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Milk,   Floor = 0 });
                    exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Wool,   Floor = 0 });
                    exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Meat,   Floor = 0 });

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
