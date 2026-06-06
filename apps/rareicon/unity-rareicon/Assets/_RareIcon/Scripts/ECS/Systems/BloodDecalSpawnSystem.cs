using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>One-shot managed bootstrap that builds the runtime decal prefab (Shader.Find + new Mesh + new Material live here, all managed) and stashes it in a BloodDecalPrefabSingleton so the Burst-compiled spawn ISystem can consume it without touching managed APIs.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class BloodDecalBootstrapSystem : SystemBase
    {
        const float DecalSize = 0.45f;

        bool _initialized;

        protected override void OnUpdate()
        {
            if (_initialized) return;

            var shader = Shader.Find("RareIcon/HexBloodDecal");
            if (shader == null)
            {
                Debug.LogError("[BloodDecalBootstrap] HexBloodDecal shader not found");
                return;
            }

            var mesh = CreateQuadMesh(DecalSize);
            var material = new Material(shader) { enableInstancing = true };

            var em = EntityManager;
            var prefab = em.CreateEntity();
            em.AddComponentData(prefab, LocalTransform.Identity);
            em.AddComponentData(prefab, new BloodDecal());
            em.AddComponentData(prefab, new BloodDecalSeedVisual());
            em.AddComponentData(prefab, new BloodDecalFadeVisual());
            em.AddComponent<Prefab>(prefab);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });
            RenderMeshUtility.AddComponents(
                prefab, em, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            var singletonEntity = em.CreateEntity(typeof(BloodDecalPrefabSingleton));
            em.SetComponentData(singletonEntity, new BloodDecalPrefabSingleton { Value = prefab });

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

    /// <summary>Pure-ECS Burst spawn consumer — instantiates the bootstrap-built prefab for each SpawnBloodDecalRequest and destroys the request. Touches no managed APIs; bails until the bootstrap singleton lands.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(BloodDecalDecaySystem))]
    public partial struct BloodDecalSpawnSystem : ISystem
    {
        const float DecalZ = -0.55f;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<SpawnBloodDecalRequest>();
            state.RequireForUpdate<BloodDecalPrefabSingleton>();
        }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var prefabSingleton = SystemAPI.GetSingleton<BloodDecalPrefabSingleton>();

            float absSeconds = 0f;
            if (SystemAPI.TryGetSingleton<WorldClock>(out var clock))
                absSeconds = clock.AbsSeconds;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            foreach (var (reqRef, entity) in
                     SystemAPI.Query<RefRO<SpawnBloodDecalRequest>>().WithEntityAccess())
            {
                var req = reqRef.ValueRO;
                var decal = ecb.Instantiate(prefabSingleton.Value);
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
    }
}
