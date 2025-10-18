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

            Entity targetEntity = Entity.Null;

            // Determine target entity based on hover state
            if (SystemAPI.TryGetSingleton<PlayerHover>(out var hover) && hover.Entity != Entity.Null)
            {
                var e = hover.Entity;
                // Any entity with EntityComponent can be selected (universal)
                if (em.HasComponent<EntityComponent>(e))
                {
                    targetEntity = e;
                }
            }

            // Get current selection to compare with new target
            var currentSelection = em.GetComponentData<SelectedEntity>(selEnt);

            // Only update if selection actually changed
            if (targetEntity != currentSelection.Entity)
            {
                em.SetComponentData(selEnt, new SelectedEntity { Entity = targetEntity });
            }
        }
    }
}