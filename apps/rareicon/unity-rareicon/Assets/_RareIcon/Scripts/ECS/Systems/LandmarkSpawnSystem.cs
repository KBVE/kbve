using System.Collections.Generic;
using KBVE.Proto.Map;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Instantiates landmark / settlement / arena / shrine / NPC-marker entities from MapdbCache. Creates one shared quad + material for HexWorldObject.shader and then spawns one of every dispatch-covered world object on a fixed ring around the map origin so the shader work is immediately visible. Future map-gen systems call SpawnAt(ref, hex) to place them authoritatively instead of relying on the debug ring; the ring is skipped if a non-debug spawn already landed first. Presentation-only: Shader.Find + Material creation are rendering concerns; server worlds don't need these.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(MapdbLoaderSystem))]
    public partial class LandmarkSpawnSystem : SystemBase
    {
        const float HexSize     = 0.25f;
        const float LandmarkSize = 1.5f;
        const float LandmarkZ   = -0.55f;
        const int   DebugRingRadius = 8;

        static LandmarkSpawnSystem _instance;

        Entity _prefab;
        bool _initialized;
        bool _debugRingSpawned;

        protected override void OnCreate()
        {
            _instance = this;
        }

        protected override void OnUpdate()
        {
            if (!MapdbCache.IsLoaded) return;

            if (!_initialized)
            {
                Init();
                if (!_initialized) return;
            }

            if (!_debugRingSpawned)
            {
                SpawnDebugRing();
                _debugRingSpawned = true;
                Enabled = false;  // one-shot; future spawns go through the static API.
            }
        }

        /// <summary>Spawn a landmark at `hex`, looked up by `refSlug` in MapdbCache. Returns Entity.Null if the ref is unknown or the shader has no dispatch for it.</summary>
        public static Entity SpawnAt(string refSlug, int2 hex)
        {
            if (_instance == null) return Entity.Null;
            if (!_instance._initialized) return Entity.Null;
            if (!MapdbCache.TryGetByRef(refSlug, out var def)) return Entity.Null;

            byte visual = WorldObjectVisualType.FromRef(refSlug);
            if (visual == WorldObjectVisualType.None) return Entity.Null;

            byte kind = KindFromProto(def.Type);
            return _instance.SpawnInternal(refSlug, visual, kind, hex);
        }

        void SpawnDebugRing()
        {
            // Walk every ref we know and drop one on a deterministic ring
            // around the origin. Step angle fills a ring of up to 24 slots.
            int i = 0;
            var entries = new List<(string refSlug, WorldObjectDef def)>();
            foreach (var def in MapdbCache.Registry.ObjectDefs)
            {
                if (string.IsNullOrEmpty(def.Ref)) continue;
                if (WorldObjectVisualType.FromRef(def.Ref) == WorldObjectVisualType.None) continue;
                entries.Add((def.Ref, def));
            }

            if (entries.Count == 0)
            {
                Debug.Log("[LandmarkSpawn] no mapdb entries match any landmark shader dispatch; skipping debug ring.");
                return;
            }

            foreach (var (refSlug, def) in entries)
            {
                double ang = (2.0 * math.PI_DBL * i) / math.max(entries.Count, 1);
                int qi = (int)math.round(DebugRingRadius * math.cos(ang));
                int ri = (int)math.round(DebugRingRadius * math.sin(ang));
                byte visual = WorldObjectVisualType.FromRef(refSlug);
                byte kind   = KindFromProto(def.Type);
                SpawnInternal(refSlug, visual, kind, new int2(qi, ri));
                i++;
            }
            Debug.Log($"[LandmarkSpawn] placed {entries.Count} world objects on debug ring (radius {DebugRingRadius}).");
        }

        Entity SpawnInternal(string refSlug, byte visual, byte kind, int2 hex)
        {
            var em = EntityManager;
            var entity = em.Instantiate(_prefab);

            float3 pos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            pos.z = LandmarkZ;
            em.SetComponentData(entity, LocalTransform.FromPosition(pos));
            em.SetComponentData(entity, new Landmark { Kind = kind, RootHex = hex });
            em.SetComponentData(entity, new LandmarkVisual { Value = visual });
            em.SetComponentData(entity, new BuildingActiveVisual { Value = 1f });
            em.SetSharedComponent(entity, new LandmarkRef
            {
                Value = new FixedString64Bytes(refSlug),
            });
            return entity;
        }

        static byte KindFromProto(WorldObjectType t) => t switch
        {
            WorldObjectType.WorldObjectSettlement => LandmarkKind.Settlement,
            WorldObjectType.WorldObjectLandmark   => LandmarkKind.Landmark,
            WorldObjectType.WorldObjectArena      => LandmarkKind.Arena,
            WorldObjectType.WorldObjectNpcMarker  => LandmarkKind.NpcMarker,
            _                                     => LandmarkKind.Prop,
        };

        void Init()
        {
            var shader = Shader.Find("RareIcon/HexWorldObject");
            if (shader == null)
            {
                Debug.LogError("[LandmarkSpawn] HexWorldObject shader not found");
                return;
            }

            var mesh = CreateQuadMesh(LandmarkSize);
            var material = new Material(shader) { enableInstancing = true };

            var em = EntityManager;
            _prefab = em.CreateEntity();
            em.AddComponentData(_prefab, LocalTransform.Identity);
            em.AddComponentData(_prefab, new Landmark());
            em.AddComponentData(_prefab, new LandmarkVisual());
            em.AddComponentData(_prefab, new BuildingActiveVisual { Value = 1f });
            em.AddSharedComponent(_prefab, new LandmarkRef
            {
                Value = new FixedString64Bytes(""),
            });
            em.AddComponent<Prefab>(_prefab);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });
            RenderMeshUtility.AddComponents(
                _prefab, em, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            using var existing = em.CreateEntityQuery(ComponentType.ReadWrite<LandmarkPrefabSingleton>());
            Entity singleton = existing.CalculateEntityCount() > 0
                ? existing.GetSingletonEntity()
                : em.CreateEntity(typeof(LandmarkPrefabSingleton));
            em.SetComponentData(singleton, new LandmarkPrefabSingleton { Prefab = _prefab });

            _initialized = true;
        }

        static Mesh CreateQuadMesh(float size)
        {
            float half = size * 0.5f;
            var mesh = new Mesh
            {
                vertices = new[]
                {
                    new Vector3(-half, -half, 0f),
                    new Vector3( half, -half, 0f),
                    new Vector3( half,  half, 0f),
                    new Vector3(-half,  half, 0f),
                },
                uv = new[]
                {
                    new Vector2(0f, 0f),
                    new Vector2(1f, 0f),
                    new Vector2(1f, 1f),
                    new Vector2(0f, 1f),
                },
                triangles = new[] { 0, 1, 2, 0, 2, 3 },
            };
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
