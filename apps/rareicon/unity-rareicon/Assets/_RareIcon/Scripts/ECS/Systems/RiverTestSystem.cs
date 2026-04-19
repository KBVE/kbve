using System.Collections.Generic;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Test harness — spawns hand-authored rivers once so we can validate
    /// PolylineDecalMeshUtil + HexRiver.shader before wiring up procedural
    /// routing or streaming. Delete or repurpose once routing lands.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class RiverTestSystem : SystemBase
    {
        bool _spawned;

        const int SplineSubdivisions = 12;

        protected override void OnUpdate()
        {
            if (_spawned) return;
            _spawned = true;

            var shader = Shader.Find("RareIcon/HexRiver");
            if (shader == null)
            {
                Debug.LogError("[RiverTestSystem] HexRiver shader not found");
                return;
            }

            // Width budget: HexSize=0.25 → tile spans ~0.5 world units across.
            // Rivers cap at MAX_RIVER_WIDTH so they never feel "lakier than a
            // hex tile". Anything that should be wider belongs to the lake biome.
            const float MAX_RIVER_WIDTH = 0.42f;

            // 1: Long meandering main river — narrow source east, widens west.
            // The tributary below joins this at (-3, -2).
            SpawnRiver(shader, new[]
            {
                new float2( 13f, -3f),
                new float2(  9f,  1f),
                new float2(  5f, -1f),
                new float2(  1f,  2f),
                new float2( -3f, -2f),
                new float2( -7f,  1f),
                new float2(-12f, -2f),
            }, startWidth: 0.16f, endWidth: MAX_RIVER_WIDTH);

            // 2: Tributary — joins the main river at (-3, -2), thin all the way.
            SpawnRiver(shader, new[]
            {
                new float2(-2f,  6f),
                new float2(-1f,  4f),
                new float2(-2f,  2f),
                new float2(-3f,  0f),
                new float2(-3f, -2f), // shares endpoint with main river vertex
            }, startWidth: 0.10f, endWidth: 0.20f);

            // 3: S-curve heading south — small standalone creek.
            SpawnRiver(shader, new[]
            {
                new float2( 6f,  5f),
                new float2( 4f,  3f),
                new float2( 6f,  1f),
                new float2( 4f, -1f),
                new float2( 6f, -3f),
                new float2( 5f, -6f),
            }, startWidth: 0.12f, endWidth: 0.28f);

            // 4: Mature river up north — gentle taper, near the cap.
            SpawnRiver(shader, new[]
            {
                new float2(-10f, 8f),
                new float2( -6f, 7f),
                new float2( -2f, 8f),
                new float2(  2f, 7f),
                new float2(  6f, 8f),
            }, startWidth: 0.30f, endWidth: 0.40f);
        }

        void SpawnRiver(Shader shader, IReadOnlyList<float2> control,
                        float startWidth, float endWidth)
        {
            var smooth = PolylineDecalMeshUtil.Smooth(control, SplineSubdivisions);
            var mesh = PolylineDecalMeshUtil.Build(smooth, startWidth, endWidth);
            var material = new Material(shader);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });

            var entity = EntityManager.CreateEntity();
            // Above hex plane, below ocean — sits cleanly on the ground.
            EntityManager.AddComponentData(entity,
                LocalTransform.FromPosition(new float3(0f, 0f, -0.5f)));

            RenderMeshUtility.AddComponents(
                entity, EntityManager, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));
        }
    }
}
