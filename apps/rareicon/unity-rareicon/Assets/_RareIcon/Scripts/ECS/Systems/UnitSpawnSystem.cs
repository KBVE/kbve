using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Test harness — spawns a single goblin entity at the world origin once
    /// so we can validate the HexUnit shader + per-creature includes before
    /// wiring up faction AI / spawning rules. Delete or repurpose later.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class UnitSpawnSystem : SystemBase
    {
        const float HexSize = 0.25f;
        const float UnitSize = 0.5f;   // matches hex bounding box → pixel-scale parity
        const int   GoblinCount  = 16;
        const int   SpawnRadius  = 8;  // hexes from origin (square footprint)

        bool _spawned;

        protected override void OnUpdate()
        {
            if (_spawned) return;
            _spawned = true;

            var shader = Shader.Find("RareIcon/HexUnit");
            if (shader == null)
            {
                Debug.LogError("[UnitSpawnSystem] HexUnit shader not found");
                return;
            }

            var mesh = CreateQuadMesh(UnitSize);
            var material = new Material(shader);
            material.enableInstancing = true;

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });

            // Deterministic scatter — each index hashes to a hex offset within
            // [-SpawnRadius, +SpawnRadius]² so we get a recognisable cluster
            // around origin instead of a single test entity.
            for (int i = 0; i < GoblinCount; i++)
            {
                uint h = (uint)(i + 1) * 0x9E3779B1u;
                h ^= h >> 13;
                h *= 0x85EBCA77u;
                int span = SpawnRadius * 2 + 1;
                int q = (int)(h % (uint)span) - SpawnRadius;
                int r = (int)((h >> 16) % (uint)span) - SpawnRadius;
                SpawnGoblin(new int2(q, r), renderDesc, renderArray);
            }

            Debug.Log($"[UnitSpawnSystem] Spawned {GoblinCount} test goblins around origin");
        }

        void SpawnGoblin(int2 hex, RenderMeshDescription renderDesc, RenderMeshArray renderArray)
        {
            var em = EntityManager;
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            // Above hex plane and above river decals (z = -0.5), below modal UI.
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type = UnitType.Goblin,
                Weapon = WeaponType.Club,
                Health = 100,
            });
            em.AddComponentData(entity, new UnitVisual       { Value = (float)UnitType.Goblin });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.Club });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovement
            {
                // Start with current hex as target so the movement system
                // immediately picks a fresh neighbour and starts walking.
                TargetHex = hex,
                MoveSpeed = 0.7f,             // ~1.4 hex per second — steady walk
                Facing    = UnitFacing.East,
            });
            em.AddComponent<UnitTestTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));
        }

        // Flat XY quad centered at origin — UV maps [0,1] across the quad,
        // which the HexUnit shader quantizes to its pixel grid.
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
