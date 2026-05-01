using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-tile fog-of-war classifier. Phase 1: origin-radius reveal — every hex within <see cref="VisibleRadius"/> of (0,0) is clear (Value 0); the rest is unexplored (Value 2). Future passes will add player-unit + player-building vision sources, plus an Explored channel (Value 1) so once-seen tiles dim instead of vanishing. Event-driven: only rebakes when the loaded tile count changes (chunk stream-in) or vision parameters shift.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(BehaviorSystemGroup))]
    public partial struct FogBakeSystem : ISystem
    {
        const int VisibleRadius = 10;

        int _lastTileCount;
        int _lastVisionHash;
        EntityQuery _tileQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _lastTileCount = 0;
            _lastVisionHash = 0;
            _tileQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<HexTileTag>()
                .WithAll<FogVisibility>()
                .Build(ref state);
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            int tileCount = _tileQuery.CalculateEntityCount();
            int visionHash = VisibleRadius;

            if (tileCount == _lastTileCount && visionHash == _lastVisionHash) return;
            _lastTileCount = tileCount;
            _lastVisionHash = visionHash;

            state.Dependency = new FogBakeJob
            {
                VisibleRadius = VisibleRadius,
            }.ScheduleParallel(state.Dependency);
        }
    }

    /// <summary>Per-tile fog worker. Writes 0 / 2 based on axial distance from origin; the explored mid-state lands when persistent explored tracking ships.</summary>
    [BurstCompile]
    public partial struct FogBakeJob : IJobEntity
    {
        public int VisibleRadius;

        void Execute(in HexCoord coord, ref FogVisibility fog)
        {
            int2 hex = new int2(coord.Q, coord.R);
            int d = AxialDistance(hex);
            float target = d <= VisibleRadius ? 0f : 2f;
            if (fog.Value != target) fog.Value = target;
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }
    }
}
