using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Attaches BarracksStorage buffer + BarracksProduction component to any Barracks that's missing them. One-shot per entity — query filters on BarracksTag WithNone BarracksProduction.</summary>
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
                em.AddBuffer<BarracksStorage>(e);
                em.AddComponentData(e, new BarracksProduction
                {
                    LastProducedTurn = 0,
                    CadenceTurns     = 1,
                    CoinCost         = 20,
                    FoodCost         = 20,
                    StorageCapacity  = 200,
                });
            }
        }
    }
}
