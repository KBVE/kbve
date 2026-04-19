using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Consumes `SpawnProjectileRequest` message entities and creates
    /// projectile entities from a shared prefab. Needs managed Unity
    /// APIs (Shader.Find, Material, Mesh, RenderMeshUtility) so it's a
    /// SystemBase rather than a Burst ISystem.
    ///
    /// Runs before ProjectileSystem so a projectile spawned this frame
    /// still ticks once, matching the "fire-and-step" expectation of
    /// callers. Uses EntityCommandBuffer for every structural change
    /// (Instantiate + DestroyEntity) so iteration over the request
    /// query stays safe.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(ProjectileSystem))]
    public partial class ProjectileSpawnSystem : SystemBase
    {
        // Quad footprint matches UnitSpawnSystem.UnitSize so projectile
        // pixels render at the same scale as creature pixels.
        const float ProjectileSize = 0.5f;
        // Z keeps projectiles above tiles + units but below modal UI.
        const float ProjectileZ = -0.8f;

        Entity _prefab;
        bool _initialized;

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                Init();
                if (!_initialized) return;  // shader missing — skip frame
            }

            var ecb = new EntityCommandBuffer(Unity.Collections.Allocator.Temp);

            foreach (var (reqRef, entity) in
                SystemAPI.Query<RefRO<SpawnProjectileRequest>>().WithEntityAccess())
            {
                var req = reqRef.ValueRO;

                var proj = ecb.Instantiate(_prefab);
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

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }

        void Init()
        {
            var shader = Shader.Find("RareIcon/HexProjectile");
            if (shader == null)
            {
                Debug.LogError("[ProjectileSpawnSystem] HexProjectile shader not found");
                return;
            }

            var mesh = CreateQuadMesh(ProjectileSize);
            var material = new Material(shader) { enableInstancing = true };

            var em = EntityManager;
            _prefab = em.CreateEntity();
            em.AddComponentData(_prefab, LocalTransform.Identity);
            em.AddComponentData(_prefab, new Projectile());
            em.AddComponentData(_prefab, new ProjectileVelocity());
            em.AddComponentData(_prefab, new ProjectileVisual());
            em.AddComponentData(_prefab, new ProjectileFacingVisual());
            em.AddComponentData(_prefab, new ProjectileModVisual());
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

        // Flat XY quad centred at origin — UV maps [0,1] across the quad
        // so HexProjectile.shader can quantise it to its pixel grid.
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
