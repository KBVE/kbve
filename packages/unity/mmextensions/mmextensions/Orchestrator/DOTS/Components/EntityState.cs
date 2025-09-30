using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Single unified state component replacing multiple boolean fields
    /// </summary>
    public struct EntityState : IComponentData
    {
        public EntityStateFlags flags;
        public float lastStateChange;

        public static EntityState CreateDefault()
        {
            return new EntityState
            {
                flags = EntityStateFlags.Idle,
                lastStateChange = 0f
            };
        }
    }

}