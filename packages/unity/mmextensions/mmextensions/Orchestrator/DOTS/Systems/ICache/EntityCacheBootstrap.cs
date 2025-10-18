using Unity.Entities;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Bootstrap system for creating the entity cache singleton entity
    /// Runs once at system initialization to set up the cache infrastructure
    /// Uses EntityBlitContainer directly for maximum performance
    /// </summary>
    [DisableAutoCreation]
    public partial class EntityCacheBootstrap : SystemBase
    {
        protected override void OnCreate()
        {
            // Create singleton entity for entity frame cache
            var cacheEntity = EntityManager.CreateEntity();
            EntityManager.AddComponent<EntityFrameCacheTag>(cacheEntity);

            // Add buffer component using EntityBlitContainer directly for maximum performance
            var buffer = EntityManager.AddBuffer<EntityBlitContainer>(cacheEntity);
            buffer.EnsureCapacity(4096); // Pre-allocate for large scenes

            // Run only once - disable after initialization
            Enabled = false;
        }

        protected override void OnUpdate()
        {
            // Empty - this system only runs for initialization
        }
    }
}