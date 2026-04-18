using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Updates ocean entity — follows camera, scales to viewport, updates shader.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class OceanTrackCameraSystem : SystemBase
    {
        static readonly int UVScaleId = Shader.PropertyToID("_UVScale");
        static readonly int WorldOffsetId = Shader.PropertyToID("_WorldOffset");

        Material _oceanMat;
        bool _triedCache;

        protected override void OnUpdate()
        {
            var cam = Camera.main;
            if (cam == null) return;

            var camPos = cam.transform.position;
            float orthoSize = cam.orthographic ? cam.orthographicSize : 10f;

            foreach (var (transform, entity) in
                     SystemAPI.Query<RefRW<LocalTransform>>()
                         .WithAll<OceanTag>()
                         .WithEntityAccess())
            {
                // Scale to fill viewport
                float height = orthoSize * 2f * 1.5f;
                float width = height * cam.aspect;
                float scale = math.max(width, height);

                transform.ValueRW.Position = new float3(camPos.x, camPos.y, 10f);
                transform.ValueRW.Scale = scale;

                // Cache material
                if (_oceanMat == null && !_triedCache)
                {
                    _triedCache = true;
                    if (EntityManager.HasComponent<RenderMeshArray>(entity))
                    {
                        var rma = EntityManager.GetSharedComponentManaged<RenderMeshArray>(entity);
                        if (rma.Materials != null && rma.Materials.Length > 0)
                            _oceanMat = rma.Materials[0] as Material;
                    }
                }
            }

            if (_oceanMat != null)
            {
                // World-space wave density — waves stay the same world size at any zoom
                // Entity fills the viewport, so UVScale = entityScale / waveWorldSize
                float height = orthoSize * 2f * 1.5f;
                float width = height * cam.aspect;
                float entityScale = math.max(width, height);
                float waveWorldSize = 0.8f; // each wave cell ~0.8 world units (~3 hex tiles)
                float uvScale = entityScale / waveWorldSize;
                _oceanMat.SetFloat(UVScaleId, uvScale);
                _oceanMat.SetVector(WorldOffsetId, new Vector4(camPos.x, camPos.y, 0, 0));
            }
            else
            {
                // Retry cache next frame
                _triedCache = false;
            }
        }
    }
}
