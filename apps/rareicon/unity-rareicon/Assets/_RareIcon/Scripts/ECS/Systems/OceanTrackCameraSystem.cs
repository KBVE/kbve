using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Updates the ocean entity to follow the camera.
    /// Adjusts UV scale so wave pattern density stays consistent across zoom levels.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct OceanTrackCameraSystem : ISystem
    {
        static readonly int UVScaleId = Shader.PropertyToID("_UVScale");

        // Base UV scale at ortho size 12 (our default zoom)
        const float BaseOrthoSize = 12f;
        const float BaseUVScale = 40f;

        Material _oceanMat;

        public void OnUpdate(ref SystemState state)
        {
            var cam = Camera.main;
            if (cam == null) return;

            var camPos = cam.transform.position;

            foreach (var (transform, entity) in
                     SystemAPI.Query<RefRW<LocalTransform>>()
                         .WithAll<OceanTag>()
                         .WithEntityAccess())
            {
                transform.ValueRW.Position = new float3(camPos.x, camPos.y, 10f);

                if (cam.orthographic)
                {
                    float height = cam.orthographicSize * 2f * 1.5f;
                    float width = height * cam.aspect;
                    float scale = math.max(width, height);
                    transform.ValueRW.Scale = scale;

                    // Compensate UV scale so waves stay same visual size regardless of zoom
                    // As entity scales up, increase UVScale proportionally
                    if (_oceanMat != null)
                    {
                        float uvScale = BaseUVScale * (cam.orthographicSize / BaseOrthoSize);
                        _oceanMat.SetFloat(UVScaleId, uvScale);
                    }
                }

                // Cache material reference on first frame
                if (_oceanMat == null)
                {
                    var em = state.EntityManager;
                    if (em.HasComponent<Unity.Rendering.RenderMeshArray>(entity))
                    {
                        var rma = em.GetSharedComponentManaged<Unity.Rendering.RenderMeshArray>(entity);
                        if (rma.Materials != null && rma.Materials.Length > 0)
                            _oceanMat = rma.Materials[0] as Material;
                    }
                }
            }
        }
    }
}
