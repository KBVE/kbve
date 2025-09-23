using Unity.Entities;
using Unity.Transforms;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Temporary diagnostic system to understand what components entities have
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class EntityDiagnosticSystem : SystemBase
    {
        private float _lastLogTime;

        protected override void OnUpdate()
        {
            // Only log every 5 seconds
            if (SystemAPI.Time.ElapsedTime - _lastLogTime < 5.0f)
                return;

            _lastLogTime = (float)SystemAPI.Time.ElapsedTime;

            // Count entities with different component combinations
            var spatialOnlyQuery = GetEntityQuery(ComponentType.ReadOnly<SpatialPosition>());
            var visibleOnlyQuery = GetEntityQuery(ComponentType.ReadOnly<Visible>());
            var bothQuery = GetEntityQuery(ComponentType.ReadOnly<SpatialPosition>(), ComponentType.ReadOnly<Visible>());
            var transformQuery = GetEntityQuery(ComponentType.ReadOnly<LocalTransform>());

            Debug.Log($"[EntityDiagnostic] SpatialPosition only: {spatialOnlyQuery.CalculateEntityCount()}");
            Debug.Log($"[EntityDiagnostic] Visible only: {visibleOnlyQuery.CalculateEntityCount()}");
            Debug.Log($"[EntityDiagnostic] Both SpatialPosition + Visible: {bothQuery.CalculateEntityCount()}");
            Debug.Log($"[EntityDiagnostic] LocalTransform: {transformQuery.CalculateEntityCount()}");
        }
    }
}