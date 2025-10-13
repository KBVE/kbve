using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(PlayerHoverSystem))]
    public partial struct ResourceHoverSelectSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;

            // Ensure the singleton exists
            if (!SystemAPI.TryGetSingletonEntity<SelectedResource>(out var selEnt))
            {
                selEnt = em.CreateEntity(typeof(SelectedResource));
                em.SetName(selEnt, "SelectedResourceSingleton");
                em.SetComponentData(selEnt, new SelectedResource { Entity = Entity.Null });
            }

            // No hover? clear
            if (!SystemAPI.TryGetSingleton<PlayerHover>(out var hover) || hover.Entity == Entity.Null)
            {
                em.SetComponentData(selEnt, new SelectedResource { Entity = Entity.Null });
                return;
            }

            var e = hover.Entity;
            if (em.HasComponent<Resource>(e) && em.HasComponent<ResourceID>(e))
                em.SetComponentData(selEnt, new SelectedResource { Entity = e });
            else
                em.SetComponentData(selEnt, new SelectedResource { Entity = Entity.Null });
        }
    }
}
