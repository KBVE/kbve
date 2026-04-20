using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Instantiates BloodDecal entities from SpawnBloodDecalRequest messages using a shared prefab; needs managed APIs so it's a SystemBase.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(BloodDecalDecaySystem))]
    public partial class BloodDecalSpawnSystem : SystemBase
    {
        const float DecalSize = 0.45f;
        const float DecalZ    = -0.55f;

        Entity _prefab;
        bool _initialized;

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                Init();
                if (!_initialized) return;
            }

            float absSeconds = 0f;
            if (SystemAPI.TryGetSingleton<WorldClock>(out var clock))
                absSeconds = clock.AbsSeconds;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(World.Unmanaged);

            foreach (var (reqRef, entity) in
                SystemAPI.Query<RefRO<SpawnBloodDecalRequest>>().WithEntityAccess())
            {
                var req = reqRef.ValueRO;
                var decal = ecb.Instantiate(_prefab);
                ecb.SetComponent(decal, LocalTransform.FromPosition(
                    new float3(req.Position.x, req.Position.y, DecalZ)));
                ecb.SetComponent(decal, new BloodDecal
                {
                    SpawnedAtAbsSeconds = absSeconds,
                    DespawnAtAbsSeconds = absSeconds + req.Lifetime,
                    Seed                = req.Seed,
                });
                ecb.SetComponent(decal, new BloodDecalSeedVisual { Value = req.Seed });
                ecb.SetComponent(decal, new BloodDecalFadeVisual { Value = 1f });
                ecb.DestroyEntity(entity);
            }
        }

        void Init()
        {
            var shader = Shader.Find("RareIcon/HexBloodDecal");
            if (shader == null)
            {
                Debug.LogError("[BloodDecalSpawnSystem] HexBloodDecal shader not found");
                return;
            }

            var mesh = CreateQuadMesh(DecalSize);
            var material = new Material(shader) { enableInstancing = true };

            var em = EntityManager;
            _prefab = em.CreateEntity();
            em.AddComponentData(_prefab, LocalTransform.Identity);
            em.AddComponentData(_prefab, new BloodDecal());
            em.AddComponentData(_prefab, new BloodDecalSeedVisual());
            em.AddComponentData(_prefab, new BloodDecalFadeVisual());
            em.AddComponent<Prefab>(_prefab);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });
            RenderMeshUtility.AddComponents(
                _prefab, em, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

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
                    new Vector2(0, 0), new Vector2(1, 0),
                    new Vector2(1, 1), new Vector2(0, 1),
                },
                triangles = new[] { 0, 2, 1, 0, 3, 2 },
            };
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
