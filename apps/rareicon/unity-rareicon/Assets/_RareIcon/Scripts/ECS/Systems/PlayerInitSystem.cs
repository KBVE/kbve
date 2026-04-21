using Unity.Entities;

namespace RareIcon
{
    /// <summary>Creates the local-player entity on startup with baseline PlayerAbilities.</summary>
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
