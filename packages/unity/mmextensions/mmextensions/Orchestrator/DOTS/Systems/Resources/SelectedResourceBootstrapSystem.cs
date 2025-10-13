using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct SelectedResourceBootstrapSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var em = state.EntityManager;
            if (!SystemAPI.TryGetSingletonEntity<SelectedResource>(out _))
            {
                var e = em.CreateEntity(typeof(SelectedResource));
                em.SetName(e, "SelectedResourceSingleton");
                em.SetComponentData(e, new SelectedResource { Entity = Entity.Null });
            }
        }
    }
}
