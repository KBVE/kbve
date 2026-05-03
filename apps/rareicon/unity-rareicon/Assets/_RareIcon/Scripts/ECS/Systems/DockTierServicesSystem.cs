using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Reactive on Dock <see cref="BuildingTier"/> change — adds / updates tier-specific service components. T1 (Shipyard) attaches <see cref="ShipyardGalleyProduction"/>; T2 (Harbour) widens the cadence + bumps cap. Off-main-thread via parallel <see cref="DockRebakeJob"/> + ECB for structural add/set.</summary>
    [BurstCompile]
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

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new DockRebakeJob
            {
                GalleyLookup = SystemAPI.GetComponentLookup<ShipyardGalleyProduction>(true),
                Ecb          = ecb,
            }.ScheduleParallel(_docksWithTier, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct DockRebakeJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<ShipyardGalleyProduction> GalleyLookup;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in BuildingTier tier)
        {
            if (tier.Value < 1) return;

            byte cadence = (byte)(tier.Value >= 2 ? 4 : 6);

            if (!GalleyLookup.HasComponent(entity))
            {
                Ecb.AddComponent(chunkIdx, entity, new ShipyardGalleyProduction
                {
                    LastProducedTurn = 0,
                    CadenceTurns     = cadence,
                    TimberCost       = 3,
                    StoneCost        = 1,
                });
            }
            else
            {
                var p = GalleyLookup[entity];
                p.CadenceTurns = cadence;
                Ecb.SetComponent(chunkIdx, entity, p);
            }
        }
    }
}
