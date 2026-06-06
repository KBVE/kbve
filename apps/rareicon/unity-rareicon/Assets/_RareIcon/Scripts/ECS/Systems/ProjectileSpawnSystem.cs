using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>One-shot bootstrap that builds the shared projectile prefab and publishes it as <see cref="ProjectilePrefabSingleton"/> for the Burst spawn consumer.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class ProjectileBootstrapSystem : SystemBase
    {

        const float ProjectileSize = 0.5f;

        bool _initialized;

        protected override void OnUpdate()
        {
            if (_initialized) return;

            var shader = Shader.Find("RareIcon/HexProjectile");
            if (shader == null)
            {
                Debug.LogError("[ProjectileBootstrap] HexProjectile shader not found");
                return;
            }

            var mesh = CreateQuadMesh(ProjectileSize);
            var material = new Material(shader) { enableInstancing = true };

            var em = EntityManager;
            var prefab = em.CreateEntity();
            em.AddComponentData(prefab, LocalTransform.Identity);
            em.AddComponentData(prefab, new Projectile());
            em.AddComponentData(prefab, new ProjectileVelocity());
            em.AddComponentData(prefab, new ProjectileVisual());
            em.AddComponentData(prefab, new ProjectileFacingVisual());
            em.AddComponentData(prefab, new ProjectileModVisual());
            em.AddComponent<Prefab>(prefab);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });
            RenderMeshUtility.AddComponents(
                prefab, em, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            var singletonEntity = em.CreateEntity(typeof(ProjectilePrefabSingleton));
            em.SetComponentData(singletonEntity, new ProjectilePrefabSingleton { Value = prefab });

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

    /// <summary>Instantiates the projectile prefab for each <see cref="SpawnProjectileRequest"/> and destroys the request. Runs before <see cref="ProjectileSystem"/> so the new projectile ticks once this frame.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(MovementSystemGroup))]
    [UpdateBefore(typeof(ProjectileSystem))]
    public partial struct ProjectileSpawnSystem : ISystem
    {
        const float ProjectileZ = -0.8f;

        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<ProjectilePrefabSingleton>(out var prefabSingleton))
                return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            foreach (var (reqRef, entity) in
                     SystemAPI.Query<RefRO<SpawnProjectileRequest>>().WithEntityAccess())
            {
                var req = reqRef.ValueRO;

                var proj = ecb.Instantiate(prefabSingleton.Value);
                ecb.SetComponent(proj, LocalTransform.FromPosition(
                    new float3(req.Position.x, req.Position.y, ProjectileZ)));
                ecb.SetComponent(proj, new Projectile
                {
                    Type         = req.Type,
                    Mod          = req.Mod,
                    Facing       = req.Facing,
                    OwnerFaction = req.OwnerFaction,
                    Lifetime     = req.Lifetime,
                    Damage       = req.Damage,
                });
                ecb.SetComponent(proj, new ProjectileVelocity { Value = req.Velocity });
                ecb.SetComponent(proj, new ProjectileVisual        { Value = req.Type });
                ecb.SetComponent(proj, new ProjectileFacingVisual  { Value = req.Facing });
                ecb.SetComponent(proj, new ProjectileModVisual     { Value = req.Mod });

                ecb.DestroyEntity(entity);
            }
        }
    }
}
