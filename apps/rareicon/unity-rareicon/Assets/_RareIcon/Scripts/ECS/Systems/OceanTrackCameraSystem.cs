using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Updates the ocean entity to follow the camera.
    /// Scales the entity to always fill the viewport.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct OceanTrackCameraSystem : ISystem
    {
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
                // Follow camera XY, stay behind hex tiles
                transform.ValueRW.Position = new float3(camPos.x, camPos.y, 10f);

                // Scale to fill viewport with padding
                if (cam.orthographic)
                {
                    float height = cam.orthographicSize * 2f * 1.5f;
                    float width = height * cam.aspect;
                    float scale = math.max(width, height);
                    transform.ValueRW.Scale = scale;
                }
            }
        }
    }
}
