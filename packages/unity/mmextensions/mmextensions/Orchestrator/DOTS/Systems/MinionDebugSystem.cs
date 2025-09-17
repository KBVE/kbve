using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Debug visualization and logging for minion systems
    /// </summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class MinionDebugSystem : SystemBase
    {
        private int _logInterval = 60; // Log every 60 frames
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
            int count = query.CalculateEntityCount();

            if (count > 0)
            {
                Debug.Log($"[MinionDebugSystem] Active Minions: {count}");
            }
        }
    }
}