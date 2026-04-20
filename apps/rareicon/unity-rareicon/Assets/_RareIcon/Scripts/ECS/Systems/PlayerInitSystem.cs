using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Creates the local-player entity on startup with the baseline
    /// ability budget. Currently that's "one city-build token"; more
    /// charges (walls, farms, unit drops) bolt onto PlayerAbilities as
    /// features land.
    ///
    /// Runs in InitializationSystemGroup so the entity exists before
    /// BuildingSpawnSystem looks for it in SimulationSystemGroup.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class PlayerInitSystem : SystemBase
    {
        bool _spawned;

        protected override void OnUpdate()
        {
            if (_spawned) return;
            _spawned = true;

            var em = EntityManager;
            var player = em.CreateEntity();
            em.AddComponent<PlayerTag>(player);
            em.AddComponentData(player, new Faction { Value = FactionType.Player });
            em.AddComponentData(player, new PlayerAbilities
            {
                CityBuildsRemaining = 1,
            });
        }
    }
}
