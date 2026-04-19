using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.InputSystem;

namespace RareIcon
{
    /// <summary>
    /// Writes MouseState singleton each frame on the main thread.
    /// Caches world position + hex coordinate so worker thread systems
    /// never need to touch Camera.main or Mouse.current.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct MouseStateSystem : ISystem
    {
        const float HexSize = 0.25f;
        int2 _lastHex;

        public void OnCreate(ref SystemState state)
        {
            state.EntityManager.CreateSingleton(new MouseState
            {
                WorldPos = float2.zero,
                HexCoord = new int2(int.MinValue, int.MinValue),
                Changed = false,
            });
            _lastHex = new int2(int.MinValue, int.MinValue);
        }

        public void OnUpdate(ref SystemState state)
        {
            var cam = Camera.main;
            var mouse = Mouse.current;
            if (cam == null || mouse == null) return;

            var screenPos = mouse.position.ReadValue();
            // For orthographic cameras, Z is the distance from camera to the plane we want.
            // Camera is at Z=-10 looking at +Z, hex tiles are at Z=0 → distance is 10.
            float zDist = math.abs(cam.transform.position.z);
            var worldPos = cam.ScreenToWorldPoint(new Vector3(screenPos.x, screenPos.y, zDist));
            float2 wp = new float2(worldPos.x, worldPos.y);

            // World to hex (pointy-top axial)
            float q = (math.sqrt(3f) / 3f * wp.x - 1f / 3f * wp.y) / HexSize;
            float r = (2f / 3f * wp.y) / HexSize;

            float3 cube = new float3(q, -q - r, r);
            float3 rounded = math.round(cube);
            float3 diff = math.abs(rounded - cube);

            if (diff.x > diff.y && diff.x > diff.z)
                rounded.x = -rounded.y - rounded.z;
            else if (diff.y > diff.z)
                rounded.y = -rounded.x - rounded.z;
            else
                rounded.z = -rounded.x - rounded.y;

            int2 hexCoord = new int2((int)rounded.x, (int)rounded.z);
            bool changed = !hexCoord.Equals(_lastHex);
            _lastHex = hexCoord;

            SystemAPI.SetSingleton(new MouseState
            {
                WorldPos = wp,
                HexCoord = hexCoord,
                Changed = changed,
            });
        }
    }
}
