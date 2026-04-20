using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Destroys buildings whose BuildingHealth hit 0, releasing HexOccupant on every footprint tile so that hex is buildable again.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial class BuildingDeathSystem : SystemBase
    {
        protected override void OnCreate() => RequireForUpdate<BuildingHealth>();

        protected override void OnUpdate()
        {
            var ecb = new EntityCommandBuffer(Allocator.Temp);

            foreach (var (hp, building, entity) in
                     SystemAPI.Query<RefRO<BuildingHealth>, RefRO<Building>>().WithEntityAccess())
            {
                if (hp.ValueRO.Value > 0) continue;

                // Free the claimed hexes — HexOccupant components on each
                // footprint tile pointed at this building entity. Once
                // we're gone those claims need to drop so a rebuild is
                // possible.
                var footprint = BuildingDB.GetFootprint(building.ValueRO.Type);
                for (int i = 0; i < footprint.Length; i++)
                {
                    var hex = building.ValueRO.RootHex + footprint[i];
                    if (HexHoverSystem.TryGetHexEntity(hex, out var tile)
                        && EntityManager.HasComponent<HexOccupant>(tile))
                    {
                        ecb.RemoveComponent<HexOccupant>(tile);
                    }
                }

                ecb.DestroyEntity(entity);
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }
    }
}
