using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using MessagePipe;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Reads MouseState singleton, moves a single hover overlay entity
    /// to the hovered hex position. No per-entity component changes.
    /// One overlay entity, one position update per frame.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class HexHoverSystem : SystemBase
    {
        const float HexSize = 0.25f;

        static NativeHashMap<int2, Entity> _hexLookup;
        static bool _initialized;

        Entity _overlayEntity;
        bool _overlayCreated;
        int2 _lastHex;

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
            _lastHex = new int2(int.MinValue, int.MinValue);
        }

        protected override void OnDestroy()
        {
            Cleanup();
        }

        protected override void OnUpdate()
        {
            if (!_initialized || !_hexLookup.IsCreated) return;

            // Create overlay entity once
            if (!_overlayCreated)
            {
                CreateOverlay();
                if (!_overlayCreated) return;
            }

            var mouse = SystemAPI.GetSingleton<MouseState>();
            if (!mouse.Changed) return;
            if (mouse.HexCoord.Equals(_lastHex)) return;
            _lastHex = mouse.HexCoord;

            // Always move overlay to hovered hex position
            float3 pos = HexMeshUtil.HexToWorld(mouse.HexCoord.x, mouse.HexCoord.y, HexSize);
            pos.z = -1f;
            EntityManager.SetComponentData(_overlayEntity, LocalTransform.FromPosition(pos));

            // Publish hover info
            bool isLand = _hexLookup.TryGetValue(mouse.HexCoord, out Entity hexEntity);
            var publisher = GlobalMessagePipe.GetPublisher<HexHoverMessage>();

            if (isLand)
            {
                var biome = EntityManager.GetComponentData<BiomeType>(hexEntity);
                publisher.Publish(new HexHoverMessage(mouse.HexCoord.x, mouse.HexCoord.y, biome.Value, true));
            }
            else
            {
                publisher.Publish(new HexHoverMessage(mouse.HexCoord.x, mouse.HexCoord.y, 0, false));
            }
        }

        void CreateOverlay()
        {
            var shader = Shader.Find("RareIcon/HexHoverOverlay");
            if (shader == null)
            {
                Debug.LogError("[HexHoverSystem] HexHoverOverlay shader not found");
                return;
            }

            var mesh = HexMeshUtil.CreateHexMesh(HexSize * 1.1f); // slightly larger than tile
            var material = new Material(shader);
            material.enableInstancing = true;

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false
            );

            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });

            _overlayEntity = EntityManager.CreateEntity();
            EntityManager.AddComponentData(_overlayEntity,
                LocalTransform.FromPosition(new float3(99999, 99999, 99999)));
            EntityManager.AddComponent<HexHoverOverlayTag>(_overlayEntity);

            RenderMeshUtility.AddComponents(
                _overlayEntity, EntityManager, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0)
            );

            _overlayCreated = true;
            Debug.Log("[HexHoverSystem] Hover overlay entity created");
        }
    }
}
