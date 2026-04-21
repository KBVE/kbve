using System.Collections.Generic;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Spawns one decal entity per <see cref="RiverDefinition"/> emitted by <c>RiverRouter</c> — polyline mesh + HexRiver material + <see cref="RiverMetadata"/>.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class RiverSpawnSystem : SystemBase
    {
        bool _spawned;

        static List<RiverDefinition> _pending;
        public static void SetRivers(List<RiverDefinition> rivers) => _pending = rivers;

        protected override void OnUpdate()
        {
            if (_spawned) return;
            if (_pending == null) return;
            _spawned = true;

            var shader = Shader.Find("RareIcon/HexRiver");
            if (shader == null)
            {
                Debug.LogError("[RiverSpawnSystem] HexRiver shader not found");
                return;
            }

            int spawned = 0;
            foreach (var river in _pending)
            {
                if (river == null || river.Points == null || river.Points.Count < 2) continue;
                SpawnRiver(shader, river);
                spawned++;
            }
            Debug.Log($"[RiverSpawnSystem] Spawned {spawned} river entities");
        }

        void SpawnRiver(Shader shader, RiverDefinition river)
        {
            var mesh = PolylineDecalMeshUtil.Build(river.Points, river.Widths);
            var material = new Material(shader);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });

            var entity = EntityManager.CreateEntity();
            EntityManager.AddComponentData(entity,
                LocalTransform.FromPosition(new float3(0f, 0f, -0.5f)));
            EntityManager.AddComponent<RiverDecalTag>(entity);
            EntityManager.AddComponentData(entity, new RiverMetadata
            {
                SourceHex = river.SourceHex,
                MouthHex = river.MouthHex,
                StartWidth = river.Widths[0],
                EndWidth = river.Widths[river.Widths.Count - 1],
                TerminatesAtWater = river.TerminatesAtWater ? (byte)1 : (byte)0,
            });

            RenderMeshUtility.AddComponents(
                entity, EntityManager, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));
        }
    }
}
