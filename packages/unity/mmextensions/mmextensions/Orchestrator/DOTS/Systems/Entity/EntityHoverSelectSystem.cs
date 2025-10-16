using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Universal hover selection system - works with any entity that has EntityComponent
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(PlayerHoverSystem))]
    public partial struct EntityHoverSelectSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;

            // Ensure the singleton exists
            if (!SystemAPI.TryGetSingletonEntity<SelectedEntity>(out var selEnt))
            {
                selEnt = em.CreateEntity(typeof(SelectedEntity));
                em.SetName(selEnt, "SelectedEntitySingleton");
                em.SetComponentData(selEnt, new SelectedEntity { Entity = Entity.Null });
            }

            // No hover? clear selection
            if (!SystemAPI.TryGetSingleton<PlayerHover>(out var hover) || hover.Entity == Entity.Null)
            {
                em.SetComponentData(selEnt, new SelectedEntity { Entity = Entity.Null });
                return;
            }

            var e = hover.Entity;

            // Any entity with EntityComponent can be selected (universal)
            if (em.HasComponent<EntityComponent>(e))
            {
                em.SetComponentData(selEnt, new SelectedEntity { Entity = e });
            }
            else
            {
                em.SetComponentData(selEnt, new SelectedEntity { Entity = Entity.Null });
            }
        }
    }
}