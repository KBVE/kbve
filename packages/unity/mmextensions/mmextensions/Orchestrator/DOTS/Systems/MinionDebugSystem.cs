using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Debug visualization and logging for minion systems
    /// </summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class MinionDebugSystem : SystemBase
    {
        private readonly int _logInterval = 60; // Log every 60 frames
        private int _frameCount = 0;

        protected override void OnUpdate()
        {
            _frameCount++;

            if (_frameCount >= _logInterval)
            {
                LogMinionStatistics();
                _frameCount = 0;
            }
        }

        private void LogMinionStatistics()
        {
            var query = GetEntityQuery(ComponentType.ReadOnly<MinionData>());
            // Performance monitoring can be done without storing the count
            query.CalculateEntityCount();

            // Debug logging removed for Burst compatibility
            // Count tracking handled by performance monitoring systems
        }
    }
}