using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Tracks the camera for the ocean entity — follows position, scales to viewport, updates shader uniforms.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
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
                float height = orthoSize * 2f * 1.5f;
                float width = height * cam.aspect;
                float scale = math.max(width, height);

                transform.ValueRW.Position = new float3(camPos.x, camPos.y, 10f);
                transform.ValueRW.Scale = scale;

                if (_oceanMat == null && !_triedCache)
                {
                    _triedCache = true;
                    if (EntityManager.HasComponent<RenderMeshArray>(entity))
                    {
                        var rma = EntityManager.GetSharedComponentManaged<RenderMeshArray>(entity);
                        if (rma.MaterialReferences != null && rma.MaterialReferences.Length > 0)
                            _oceanMat = rma.MaterialReferences[0].Value as Material;
                    }
                }
            }

            if (_oceanMat != null)
            {
                // Wave cells are world-space anchored so they don't swim on zoom: UVScale maps the
                // viewport-filling quad to 0.8wu cells, WorldOffset cancels camera motion.
                float height = orthoSize * 2f * 1.5f;
                float width = height * cam.aspect;
                float entityScale = math.max(width, height);
                float waveWorldSize = 0.8f;
                float uvScale = entityScale / waveWorldSize;
                _oceanMat.SetFloat(UVScaleId, uvScale);
                _oceanMat.SetVector(WorldOffsetId, new Vector4(
                    camPos.x / entityScale,
                    camPos.y / entityScale,
                    0, 0));
            }
            else
            {
                _triedCache = false;
            }
        }
    }
}
