using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using MessagePipe;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Reads MouseState singleton, looks up hovered hex via persistent HashMap.
    /// The HashMap is maintained by HexChunkSystem — add on spawn, remove on despawn.
    /// One allocation, never rebuilt.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class HexHoverSystem : SystemBase
    {
        static NativeHashMap<int2, Entity> _hexLookup;
        static bool _initialized;

        Entity _lastHoveredEntity;
        bool _hasLast;

        public static void Initialize(int capacity)
        {
            if (_initialized && _hexLookup.IsCreated) _hexLookup.Dispose();
            _hexLookup = new NativeHashMap<int2, Entity>(capacity, Allocator.Persistent);
            _initialized = true;
        }

        public static void AddHex(int2 coord, Entity entity)
        {
            if (!_initialized) Initialize(4096);
            _hexLookup.TryAdd(coord, entity);
        }

        public static void RemoveHex(int2 coord)
        {
            if (_initialized && _hexLookup.IsCreated)
                _hexLookup.Remove(coord);
        }

        public static void Cleanup()
        {
            if (_initialized && _hexLookup.IsCreated)
            {
                _hexLookup.Dispose();
                _initialized = false;
            }
        }

        protected override void OnCreate()
        {
            RequireForUpdate<MouseState>();
        }

        protected override void OnDestroy()
        {
            Cleanup();
        }

        protected override void OnUpdate()
        {
            if (!_initialized || !_hexLookup.IsCreated) return;

            var mouse = SystemAPI.GetSingleton<MouseState>();
            if (!mouse.Changed) return;

            // Remove tag from previous
            if (_hasLast && EntityManager.Exists(_lastHoveredEntity)
                        && EntityManager.HasComponent<HexHoveredTag>(_lastHoveredEntity))
            {
                EntityManager.RemoveComponent<HexHoveredTag>(_lastHoveredEntity);
                _hasLast = false;
            }

            // O(1) lookup
            if (_hexLookup.TryGetValue(mouse.HexCoord, out Entity entity))
            {
                EntityManager.AddComponent<HexHoveredTag>(entity);
                _lastHoveredEntity = entity;
                _hasLast = true;

                var biome = EntityManager.GetComponentData<BiomeType>(entity);
                var publisher = GlobalMessagePipe.GetPublisher<HexHoverMessage>();
                publisher.Publish(new HexHoverMessage(
                    mouse.HexCoord.x, mouse.HexCoord.y, biome.Value, true
                ));
            }
            else
            {
                var publisher = GlobalMessagePipe.GetPublisher<HexHoverMessage>();
                publisher.Publish(new HexHoverMessage(
                    mouse.HexCoord.x, mouse.HexCoord.y, 0, false
                ));
            }
        }
    }
}
