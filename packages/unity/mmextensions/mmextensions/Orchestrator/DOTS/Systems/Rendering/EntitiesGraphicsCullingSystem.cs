using Unity.Entities;
using Unity.Rendering;
using Unity.Transforms;

// TODO: 11-04-2025 - This whole Culling might be pointless , we could just slate this file to be removed.

namespace KBVE.MMExtensions.Orchestrator.DOTS.Rendering
{
    /// <summary>
    /// Ensures all renderable entities have RenderBounds for frustum culling.
    /// Without RenderBounds, EntitiesGraphicsSystem processes ALL entities every frame,
    /// even those off-screen, causing performance issues.
    ///
    /// This system adds default bounds to entities missing them.
    /// Unity's culling systems will then automatically skip off-screen entities.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class EntitiesGraphicsCullingSystem : SystemBase
    {
        private EntityQuery _missingBoundsQuery;

        protected override void OnCreate()
        {
            // Query for renderable entities without bounds
            _missingBoundsQuery = GetEntityQuery(new EntityQueryDesc
            {
                All = new[]
                {
                    ComponentType.ReadOnly<LocalToWorld>(),
                    // MaterialMeshInfo is added by Entities Graphics for renderable entities
                    ComponentType.ReadOnly<MaterialMeshInfo>()
                },
                None = new[]
                {
                    ComponentType.ReadOnly<RenderBounds>()
                }
            });
        }

        protected override void OnUpdate()
        {
            // Only run when there are entities missing bounds
            if (_missingBoundsQuery.IsEmpty)
                return;

            // Add default render bounds to all entities
            // Unity will calculate actual bounds from mesh, this just enables culling
            EntityManager.AddComponent<RenderBounds>(_missingBoundsQuery);
        }
    }
}
