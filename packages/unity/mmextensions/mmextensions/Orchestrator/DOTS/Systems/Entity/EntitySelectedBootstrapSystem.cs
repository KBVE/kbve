using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Bootstrap system that ensures the SelectedEntity singleton exists.
    /// Replaces resource-specific SelectedResourceBootstrapSystem with universal approach.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct EntitySelectedBootstrapSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var em = state.EntityManager;
            if (!SystemAPI.TryGetSingletonEntity<SelectedEntity>(out _))
            {
                var e = em.CreateEntity(typeof(SelectedEntity));
                em.SetName(e, "SelectedEntitySingleton");
                em.SetComponentData(e, new SelectedEntity { Entity = Entity.Null });
            }
        }
    }
}