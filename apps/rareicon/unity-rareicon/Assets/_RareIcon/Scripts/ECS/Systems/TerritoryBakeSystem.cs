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

            bool emittersChanged = emitterHash != _lastEmitterHash;
            bool tilesChanged    = tileCount   != _lastTileCount;
            if (!emittersChanged && !tilesChanged) return;

            _lastEmitterHash = emitterHash;
            _lastTileCount   = tileCount;

            var emitters = new NativeList<TerritoryEmitter>(8, Allocator.TempJob);
            foreach (var e in SystemAPI.Query<RefRO<TerritoryEmitter>>().WithAll<EmpireConnected>())
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

        [BurstCompile]
        int HashEmitters(ref SystemState state)
        {
            int h = 17;
            foreach (var e in SystemAPI.Query<RefRO<TerritoryEmitter>>().WithAll<EmpireConnected>())
            {
                h = h * 31 + e.ValueRO.Center.x;
                h = h * 31 + e.ValueRO.Center.y;
                h = h * 31 + e.ValueRO.Radius;
                h = h * 31 + e.ValueRO.OwnerFaction;
            }
            return h;
        }
    }

    /// <summary>Per-tile worker — classifies a single hex against the snapshot of all active emitters. Encodes faction in the high bucket of the float: 0 = outside, 1 = player interior, 2 = player edge, 4 = hostile interior, 5 = hostile edge. Hostile beats player when both claim a tile so the player sees the threat ring through their own territory.</summary>
    [BurstCompile]
    public partial struct BakeJob : IJobEntity
    {
        [ReadOnly] public NativeArray<TerritoryEmitter> Emitters;

        void Execute(in HexCoord coord, ref TerritoryVisual visual)
        {
            var hex = new int2(coord.Q, coord.R);
            byte inFac = OwnerInside(hex, Emitters);
            if (inFac == 0)
            {
                if (visual.Value != 0f) visual.Value = 0f;
                return;
            }

            float baseValue = inFac == FactionType.Hostile ? 3f : 0f;
            for (int n = 0; n < 6; n++)
            {
                if (!FactionInside(hex + HexNeighbor(n), inFac, Emitters))
                {
                    float edge = baseValue + 2f;
                    if (visual.Value != edge) visual.Value = edge;
                    return;
                }
            }

            float interior = baseValue + 1f;
            if (visual.Value != interior) visual.Value = interior;
        }

        static byte OwnerInside(int2 hex, NativeArray<TerritoryEmitter> emitters)
        {
            byte hit = 0;
            for (int i = 0; i < emitters.Length; i++)
            {
                var e = emitters[i];
                if (AxialDistance(hex - e.Center) > e.Radius) continue;
                if (e.OwnerFaction == FactionType.Hostile) return FactionType.Hostile;
                if (e.OwnerFaction == FactionType.Player)  hit = FactionType.Player;
            }
            return hit;
        }

        static bool FactionInside(int2 hex, byte faction, NativeArray<TerritoryEmitter> emitters)
        {
            for (int i = 0; i < emitters.Length; i++)
            {
                var e = emitters[i];
                if (e.OwnerFaction != faction) continue;
                if (AxialDistance(hex - e.Center) <= e.Radius) return true;
            }
            return false;
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }

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
