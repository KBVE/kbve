using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Attaches an InventorySlot buffer + BarracksProduction + StorageCapacity to any Barracks that's missing them. One-shot per entity — query filters on BarracksTag WithNone BarracksProduction.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class BarracksInitSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var em = EntityManager;

            using var query = em.CreateEntityQuery(
                new EntityQueryDesc
                {
                    All  = new[] { ComponentType.ReadOnly<BarracksTag>() },
                    None = new[] { ComponentType.ReadOnly<BarracksProduction>() },
                });
            using var entities = query.ToEntityArray(Allocator.Temp);
            if (entities.Length == 0) return;

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                if (!em.HasBuffer<InventorySlot>(e))
                    em.AddBuffer<InventorySlot>(e);
                em.AddComponentData(e, new BarracksProduction
                {
                    LastProducedTurn = 0,
                    CadenceTurns     = 1,
                    CoinCost         = 20,
                    FoodCost         = 20,
                });
                em.AddComponentData(e, new StorageCapacity { Total = 200 });

                // Arrow craft, same recipe as the Capital. Inputs pulled
                // from the Capital treasury (Barracks doesn't stock raw
                // materials itself — its storage is for coin + food only)
                // and outputs land in the Barracks' own InventorySlot so
                // nearby Guards / future bow-wielding goblins can draw
                // from it when arrow-hauling lands.
                var recipes = em.AddBuffer<ProductionRecipe>(e);
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
            }
        }
    }
}
