using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-tile territory classifier. Event-driven: rebakes only when the emitter set changes (build/destroy/radius++) or the loaded tile count grows (chunk stream-in). No per-frame work on the steady-state — two ints compared per tick, then early-out.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(BehaviorSystemGroup))]
    public partial struct TerritoryBakeSystem : ISystem
    {
        int _lastEmitterHash;
        int _lastTileCount;
        EntityQuery _tileQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _lastEmitterHash = 0;
            _lastTileCount   = 0;
            _tileQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<HexTileTag>()
                .WithAll<TerritoryVisual>()
                .Build(ref state);
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            int emitterHash = HashEmitters(ref state);
            int tileCount   = _tileQuery.CalculateEntityCount();

            // Bake only when something relevant actually changed. Territory
            // geometry is static between emitter mutations and the byte we
            // wrote last tick is still correct for every existing tile —
            // the only reasons to redo the work are (a) a building was
            // added/removed/expanded (emitter hash shifts), or (b) new
            // chunks streamed in and their tiles are sitting at the default
            // 0 waiting to be classified. A turn boundary doesn't change
            // territory on its own, so we don't poll WorldClock here.
            bool emittersChanged = emitterHash != _lastEmitterHash;
            bool tilesChanged    = tileCount   != _lastTileCount;
            if (!emittersChanged && !tilesChanged) return;

            _lastEmitterHash = emitterHash;
            _lastTileCount   = tileCount;

            var emitters = new NativeList<TerritoryEmitter>(8, Allocator.TempJob);
            foreach (var e in SystemAPI.Query<RefRO<TerritoryEmitter>>())
            {
                if (e.ValueRO.Radius == 0) continue;
                emitters.Add(e.ValueRO);
            }

            state.Dependency = new BakeJob
            {
                Emitters = emitters.AsArray(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = emitters.Dispose(state.Dependency);
        }

        static int HashEmitters(ref SystemState state)
        {
            int h = 17;
            foreach (var e in SystemAPI.Query<RefRO<TerritoryEmitter>>())
            {
                h = h * 31 + e.ValueRO.Center.x;
                h = h * 31 + e.ValueRO.Center.y;
                h = h * 31 + e.ValueRO.Radius;
                h = h * 31 + e.ValueRO.OwnerFaction;
            }
            return h;
        }
    }

    /// <summary>Per-tile worker — classifies a single hex against the snapshot of all active emitters.</summary>
    [BurstCompile]
    public partial struct BakeJob : IJobEntity
    {
        [ReadOnly] public NativeArray<TerritoryEmitter> Emitters;

        void Execute(in HexCoord coord, ref TerritoryVisual visual)
        {
            var hex = new int2(coord.Q, coord.R);
            if (!Inside(hex, Emitters))
            {
                if (visual.Value != 0f) visual.Value = 0f;
                return;
            }

            for (int n = 0; n < 6; n++)
            {
                if (!Inside(hex + HexNeighbor(n), Emitters))
                {
                    if (visual.Value != 2f) visual.Value = 2f;
                    return;
                }
            }

            if (visual.Value != 1f) visual.Value = 1f;
        }

        static bool Inside(int2 hex, NativeArray<TerritoryEmitter> emitters)
        {
            for (int i = 0; i < emitters.Length; i++)
            {
                var e = emitters[i];
                if (AxialDistance(hex - e.Center) <= e.Radius) return true;
            }
            return false;
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }

        // Six axial-neighbour offsets. Matches HexMeshUtil.HexNeighbor but inlined
        // here so the Burst job stays free of managed/static lookups.
        static int2 HexNeighbor(int dir)
        {
            switch (dir)
            {
                case 0: return new int2( 1,  0);
                case 1: return new int2( 1, -1);
                case 2: return new int2( 0, -1);
                case 3: return new int2(-1,  0);
                case 4: return new int2(-1,  1);
                default: return new int2( 0,  1);
            }
        }
    }
}
