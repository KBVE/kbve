using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial
{
    /// <summary>
    /// Maintains spatial indices for efficient queries
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(SpatialQuerySystem))]
    public partial class SpatialIndexingSystem : SystemBase
    {
        private KDTree _kdTree;
        private int _framesSinceRebuild;
        private const int RebuildInterval = 30; // Rebuild every 30 frames

        protected override void OnCreate()
        {
            _kdTree = new KDTree(1000, Allocator.Persistent);
            _framesSinceRebuild = 0;
        }

        protected override void OnDestroy()
        {
            _kdTree.Dispose();
        }

        protected override void OnUpdate()
        {
            _framesSinceRebuild++;

            // Periodic KD-Tree rebuild
            if (_framesSinceRebuild >= RebuildInterval)
            {
                RebuildKDTree();
                _framesSinceRebuild = 0;
            }
        }

        private void RebuildKDTree()
        {
            var query = GetEntityQuery(
                ComponentType.ReadOnly<MinionData>(),
                ComponentType.ReadOnly<SpatialPosition>()
            );

            var entities = query.ToEntityArray(Allocator.Temp);
            var positions = query.ToComponentDataArray<SpatialPosition>(Allocator.Temp);

            if (entities.Length > 0)
            {
                var posArray = new NativeArray<float3>(entities.Length, Allocator.Temp);
                for (int i = 0; i < entities.Length; i++)
                {
                    posArray[i] = positions[i].Position;
                }

                KDTreeBuilder.BuildTree(ref _kdTree, entities, posArray);
                posArray.Dispose();
            }

            entities.Dispose();
            positions.Dispose();
        }
    }
}