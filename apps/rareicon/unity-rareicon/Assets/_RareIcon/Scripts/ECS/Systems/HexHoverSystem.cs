using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Reads MouseState singleton, looks up hovered hex via cached HashMap.
    /// Tags entity with HexHoveredTag. No main-thread-only calls.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct HexHoverSystem : ISystem
    {
        NativeHashMap<int2, Entity> _hexLookup;
        Entity _lastHoveredEntity;
        bool _hasLast;
        bool _lookupBuilt;

        public void OnCreate(ref SystemState state)
        {
            _hasLast = false;
            _lookupBuilt = false;
            state.RequireForUpdate<MouseState>();
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_hexLookup.IsCreated) _hexLookup.Dispose();
        }

        public void OnUpdate(ref SystemState state)
        {
            if (!_lookupBuilt)
            {
                BuildLookup(ref state);
                if (!_lookupBuilt) return;
            }

            var mouse = SystemAPI.GetSingleton<MouseState>();
            if (!mouse.Changed) return;

            // Remove tag from previous
            if (_hasLast && state.EntityManager.Exists(_lastHoveredEntity)
                        && state.EntityManager.HasComponent<HexHoveredTag>(_lastHoveredEntity))
            {
                state.EntityManager.RemoveComponent<HexHoveredTag>(_lastHoveredEntity);
                _hasLast = false;
            }

            // O(1) lookup
            if (_hexLookup.TryGetValue(mouse.HexCoord, out Entity entity))
            {
                state.EntityManager.AddComponent<HexHoveredTag>(entity);
                _lastHoveredEntity = entity;
                _hasLast = true;
            }
        }

        void BuildLookup(ref SystemState state)
        {
            var query = SystemAPI.QueryBuilder().WithAll<HexCoord, HexTileTag>().Build();
            int count = query.CalculateEntityCount();
            if (count == 0) return;

            _hexLookup = new NativeHashMap<int2, Entity>(count, Allocator.Persistent);

            foreach (var (coord, entity) in
                     SystemAPI.Query<RefRO<HexCoord>>()
                         .WithAll<HexTileTag>()
                         .WithEntityAccess())
            {
                _hexLookup.TryAdd(new int2(coord.ValueRO.Q, coord.ValueRO.R), entity);
            }

            _lookupBuilt = true;
            Debug.Log($"[HexHoverSystem] Built lookup with {count} entries");
        }
    }
}
