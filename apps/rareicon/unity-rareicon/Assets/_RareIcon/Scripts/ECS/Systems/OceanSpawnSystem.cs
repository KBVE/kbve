using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Spawns a single ocean background entity with the ocean shader.
    /// Lives in the same ECS world as hex tiles.
    /// Runs once at initialization.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateBefore(typeof(HexSpawnSystem))]
    public partial struct OceanSpawnSystem : ISystem
    {
        bool _spawned;

        public void OnCreate(ref SystemState state)
        {
            _spawned = false;
        }

        public void OnUpdate(ref SystemState state)
        {
            if (_spawned) return;
            _spawned = true;

            var shader = Shader.Find("RareIcon/OceanBackground");
            if (shader == null)
            {
                Debug.LogError("[OceanSpawnSystem] Shader 'RareIcon/OceanBackground' not found");
                return;
            }

            // Create ocean quad mesh — large enough to fill any camera view
            var mesh = CreateQuad();
            var material = new Material(shader);
            material.enableInstancing = true;

            var renderMeshDescription = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false
            );

            var renderMeshArray = new RenderMeshArray(
                new[] { material },
                new[] { mesh }
            );

            var em = state.EntityManager;
            var entity = em.CreateEntity();

            // Position behind hex tiles (higher Z = further from 2D camera)
            em.AddComponentData(entity, LocalTransform.FromPositionRotationScale(
                new float3(0, 0, 10f),
                quaternion.identity,
                100f
            ));

            em.AddComponent<OceanTag>(entity);

            RenderMeshUtility.AddComponents(
                entity,
                em,
                renderMeshDescription,
                renderMeshArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0)
            );

            Debug.Log("[OceanSpawnSystem] Ocean entity created");
        }

        static Mesh CreateQuad()
        {
            var mesh = new Mesh
            {
                vertices = new[]
                {
                    new Vector3(-0.5f, -0.5f, 0),
                    new Vector3(0.5f, -0.5f, 0),
                    new Vector3(0.5f, 0.5f, 0),
                    new Vector3(-0.5f, 0.5f, 0),
                },
                uv = new[]
                {
                    new Vector2(0, 0),
                    new Vector2(1, 0),
                    new Vector2(1, 1),
                    new Vector2(0, 1),
                },
                // Double-sided
                triangles = new[]
                {
                    0, 1, 2, 0, 2, 3,
                    0, 2, 1, 0, 3, 2,
                },
            };
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
