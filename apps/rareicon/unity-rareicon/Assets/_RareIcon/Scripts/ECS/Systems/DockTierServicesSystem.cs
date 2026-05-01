using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Reactive on Dock <see cref="BuildingTier"/> change — adds tier-specific service components. T1 (Shipyard) attaches <see cref="ShipyardGalleyProduction"/> so the Galley craft cycle starts firing; T2 (Harbour) widens the cadence + bumps cap. Mirrors the Inn / Lumbercamp / MiningPit tier-services pattern.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct DockTierServicesSystem : ISystem
    {
        EntityQuery _docksWithTier;

        public void OnCreate(ref SystemState state)
        {
            _docksWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<DockTag, BuildingTier>()
                .Build(ref state);
            _docksWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_docksWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var entities   = _docksWithTier.ToEntityArray(Allocator.Temp);
            var tierLookup = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var galleyLookup = SystemAPI.GetComponentLookup<ShipyardGalleyProduction>(false);
            var em = state.EntityManager;

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                byte tier = tierLookup[e].Value;

                if (tier >= 1)
                {
                    if (!galleyLookup.HasComponent(e))
                    {
                        em.AddComponentData(e, new ShipyardGalleyProduction
                        {
                            LastProducedTurn = 0,
                            CadenceTurns     = (byte)(tier >= 2 ? 4 : 6),
                            TimberCost       = 3,
                            StoneCost        = 1,
                        });
                    }
                    else
                    {
                        var p = em.GetComponentData<ShipyardGalleyProduction>(e);
                        p.CadenceTurns = (byte)(tier >= 2 ? 4 : 6);
                        em.SetComponentData(e, p);
                    }
                }
            }
            entities.Dispose();
        }
    }
}
