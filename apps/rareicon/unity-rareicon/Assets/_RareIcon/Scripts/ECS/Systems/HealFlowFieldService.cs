using RareIcon.Native;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Owns the uniti flow-field plumbing for healing dispatch. Caches a <see cref="NativeList{int2}"/> of <see cref="ProvidesHealing"/> root hexes and a <see cref="NativeFlowField"/> goal-seeking field on top of a fixed <see cref="NativeGrid"/> centered on the world origin. The cached hex list refills every tick from a Persistent buffer (no per-frame alloc) and the flow field rebuilds only when the healer-set hash differs — typically only on building placement, demolition, or destruction. Consumers (<see cref="UnitBehaviorSystem"/>) read <see cref="HealerHexes"/> and pass the array into their burst job; the flow-field handle is plumbed for upcoming O(1) "is healer reachable from here" early-outs.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(UnitBehaviorSystem))]
    public partial class HealFlowFieldService : SystemBase
    {
        const int GridSize    = 192;
        const int GridOriginX = -GridSize / 2;
        const int GridOriginZ = -GridSize / 2;

        NativeGrid       _grid;
        NativeFlowField  _field;
        NativeList<int2> _healerHexes;
        EntityQuery      _healersQuery;
        ulong            _lastHash;

        public NativeArray<int2> HealerHexes =>
            _healerHexes.IsCreated ? _healerHexes.AsArray() : default;

        public NativeFlowField Field => _field;

        public bool HasField => _field != null && _field.IsValid;

        protected override void OnCreate()
        {
            _healerHexes  = new NativeList<int2>(8, Allocator.Persistent);
            _healersQuery = GetEntityQuery(
                ComponentType.ReadOnly<ProvidesHealing>(),
                ComponentType.ReadOnly<Building>());
            BuildGrid();
        }

        void BuildGrid()
        {
            _grid = NativeGrid.Create(GridOriginX, GridOriginZ, GridSize, GridSize);
            if (_grid == null || !_grid.IsValid) return;
            for (int z = 0; z < GridSize; z++)
            {
                int gz = GridOriginZ + z;
                for (int x = 0; x < GridSize; x++)
                {
                    _grid.SetCell(GridOriginX + x, gz, 0, NativeGrid.SurfaceKind.Solid);
                }
            }
        }

        protected override void OnUpdate()
        {
            _healerHexes.Clear();
            ulong hash = 1469598103934665603UL;
            var buildings = _healersQuery.ToComponentDataArray<Building>(Allocator.Temp);
            for (int i = 0; i < buildings.Length; i++)
            {
                var hex = buildings[i].RootHex;
                _healerHexes.Add(hex);
                hash ^= (ulong)(uint)hex.x; hash *= 1099511628211UL;
                hash ^= (ulong)(uint)hex.y; hash *= 1099511628211UL;
            }
            buildings.Dispose();

            if (hash == _lastHash) return;
            _lastHash = hash;

            _field?.Dispose();
            _field = null;
            if (_healerHexes.Length > 0 && _grid != null && _grid.IsValid)
                _field = NativeFlowField.Compute(_grid, _healerHexes.AsArray());
        }

        protected override void OnDestroy()
        {
            if (_healerHexes.IsCreated) _healerHexes.Dispose();
            _field?.Dispose();
            _grid?.Dispose();
        }
    }
}
