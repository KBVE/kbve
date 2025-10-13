using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    [UpdateAfter(typeof(KBVE.MMExtensions.Orchestrator.DOTS.ResourceHoverSelectSystem))]
    public partial struct ResourceToVmDrainSystem : ISystem
    {
        private ComponentLookup<Resource>     _resLookup;
        private ComponentLookup<ResourceID>   _idLookup;
        private ComponentLookup<LocalToWorld> _l2wLookup;

        public void OnCreate(ref SystemState state)
        {
            _resLookup = state.GetComponentLookup<Resource>(true);
            _idLookup  = state.GetComponentLookup<ResourceID>(true);
            _l2wLookup = state.GetComponentLookup<LocalToWorld>(true);

            // Optional: only run once SelectedResource exists (if a bootstrap creates it in Initialization)
            // state.RequireForUpdate<SelectedResource>();
        }

        public void OnUpdate(ref SystemState state)
        {
            _resLookup.Update(ref state);
            _idLookup.Update(ref state);
            _l2wLookup.Update(ref state);

            // read resource-specific selection
            if (!SystemAPI.TryGetSingleton(out SelectedResource sel) || sel.Entity == Entity.Null)
            {
                if (ResourceViewModel.Instance != null)
                    ResourceViewModel.Instance.Current.Value = null;
                return;
            }

            var e = sel.Entity;

            // must have Resource + ResourceID
            if (!_resLookup.HasComponent(e) || !_idLookup.HasComponent(e))
            {
               if (ResourceViewModel.Instance != null)
                    ResourceViewModel.Instance.Current.Value = null;
                return;
            }

            var res = _resLookup[e];
            var id  = _idLookup[e];

            float3 pos = float3.zero;
            if (_l2wLookup.HasComponent(e))
                pos = _l2wLookup[e].Position;

            var blit = new ResourceBlit
            {
                Ulid         = id.ulid,
                Type         = (byte)res.type,
                Flags        = (byte)res.flags,
                Amount       = res.amount,
                MaxAmount    = res.maxAmount,
                HarvestYield = res.harvestYield,
                HarvestTime  = res.harvestTime,
                WorldPos     = pos
            };

            if (ResourceViewModel.Instance != null)
                ResourceViewModel.Instance.Current.Value = blit;
        }
    }
}
