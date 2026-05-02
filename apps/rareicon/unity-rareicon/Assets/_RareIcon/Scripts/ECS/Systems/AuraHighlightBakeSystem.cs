using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-tile aura-radius highlight baker. Reads the singleton <see cref="AuraHighlightTarget"/> (written by <c>UIBuildingInspector</c> when the player clicks an aura-carrying building) and writes <see cref="AuraHighlightVisual"/>=1 onto every tile within axial radius of <c>Center</c>; 0 everywhere else. Generation-gated so the parallel job only fires when the inspected target changes (or the panel closes); steady-state is a single int compare per frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(BehaviorSystemGroup))]
    public partial struct AuraHighlightBakeSystem : ISystem
    {
        uint _lastSeenGeneration;
        EntityQuery _tileQuery;

        EntityQuery _singletonQuery;

        public void OnCreate(ref SystemState state)
        {
            _lastSeenGeneration = uint.MaxValue;
            _tileQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<HexTileTag>()
                .WithAll<AuraHighlightVisual>()
                .Build(ref state);
            _singletonQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<AuraHighlightTarget>()
                .Build(ref state);
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (_singletonQuery.CalculateEntityCount() == 0)
            {
                var e = state.EntityManager.CreateEntity(typeof(AuraHighlightTarget));
                state.EntityManager.SetName(e, "AuraHighlightTarget");
                state.EntityManager.SetComponentData(e, new AuraHighlightTarget
                {
                    Center     = int2.zero,
                    Radius     = 0,
                    Active     = 0,
                    Generation = 0,
                });
                return;
            }

            var target = _singletonQuery.GetSingleton<AuraHighlightTarget>();
            if (target.Generation == _lastSeenGeneration) return;
            _lastSeenGeneration = target.Generation;

            state.Dependency = new AuraHighlightBakeJob
            {
                Center = target.Center,
                Radius = target.Radius,
                Active = target.Active,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct AuraHighlightBakeJob : IJobEntity
    {
        public int2 Center;
        public byte Radius;
        public byte Active;

        void Execute(in HexCoord coord, ref AuraHighlightVisual visual)
        {
            if (Active == 0 || Radius == 0)
            {
                if (visual.Value != 0f) visual.Value = 0f;
                return;
            }
            int2 hex = new int2(coord.Q, coord.R);
            int d = AxialDistance(hex - Center);
            float target = d <= Radius ? 1f : 0f;
            if (visual.Value != target) visual.Value = target;
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }
    }
}
