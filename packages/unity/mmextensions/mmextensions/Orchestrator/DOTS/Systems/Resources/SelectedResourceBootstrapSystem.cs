using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{


    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct SelectedResourceBootstrapSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<SelectedResource>())
            {
                var e = state.EntityManager.CreateEntity();
                state.EntityManager.AddComponentData(e, new SelectedResource
                {
                    Entity = Entity.Null
                });
            }

            state.Enabled = false;
        }

        public void OnUpdate(ref SystemState state)
        {

        }


    }

}