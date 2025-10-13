using Unity.Entities;

// VMDrain would or should read the ECS data and then push it into a Blittable snapshot, that we can sync from an off thread to the main thread.
// Under a simple Sync R3 like SynchronizedReactiveProperty<ResourceBlit> , which should make it easy for pTS to gen / share from C# to TS/JS.


namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial struct ResourceToVmDrainSystem : ISystem
    {

        private ComponentLookup<Resource> _resLookup;
        private ComponentLookup<ResourceID> _idLookup;

        public void OnCreate(ref SystemState state)
        {
            _resLookup = state.GetComponentLookup<Resource>(isReadOnly: true);
            _idLookup = state.GetComponentLookup<ResourceID>(isReadOnly: true);
        }

        public void OnUpdate(ref SystemState state)
        {
            _resLookup.Update(ref state);
            _idLookup.Update(ref state);

            // &&Guard
            if (!SystemAPI.TryGetSingleton(out SelectedResource sel))
                return;

            var e = sel.Entity;
            
            
            
        }
    }

}