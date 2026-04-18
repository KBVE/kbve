using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Spawns hex tile entities from Burst-generated biome data.
    /// Runs once at startup, spawns all land hexes as ECS entities
    /// with Entity Graphics rendering components.
    ///
    /// TODO: Chunk-based streaming — only spawn visible hexes
    /// TODO: Biome data from Rust FFI
    /// TODO: LOD — distant hexes use simpler rendering
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct HexSpawnSystem : ISystem
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

            int mapSize = 64;
            int seed = 1337;
            float hexSize = 0.25f;

            // Generate biome data via Burst job
            var generator = new BiomeGenerator(mapSize, seed);
            var handle = generator.Schedule(out NativeArray<byte> pixels);
            handle.Complete();

            // Create shared hex mesh + one material per biome
            var hexMesh = HexMeshUtil.CreateHexMesh(hexSize * 0.95f);
            var biomeMaterials = new Material[7];
            var baseShader = Shader.Find("Universal Render Pipeline/Unlit");

            for (int i = 0; i < 7; i++)
            {
                biomeMaterials[i] = new Material(baseShader);
                biomeMaterials[i].enableInstancing = true;
                biomeMaterials[i].SetFloat("_Cull", 0); // Off — double-sided
                var c = HexMeshUtil.BiomeColor((byte)i);
                biomeMaterials[i].SetColor("_BaseColor", new Color(c.x, c.y, c.z, c.w));
            }

            var renderMeshDescription = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false
            );

            var renderMeshArray = new RenderMeshArray(
                biomeMaterials,
                new[] { hexMesh }
            );

            var em = state.EntityManager;
            int half = mapSize / 2;
            int spawned = 0;

            for (int y = 0; y < mapSize; y++)
            {
                for (int x = 0; x < mapSize; x++)
                {
                    int idx = (y * mapSize + x) * 4;
                    byte biomeId = pixels[idx];

                    // Skip ocean — no entity needed
                    if (biomeId == BiomeGenerator.BIOME_OCEAN) continue;

                    int q = x - half;
                    int r = y - half;
                    float3 worldPos = HexMeshUtil.HexToWorld(q, r, hexSize);

                    var entity = em.CreateEntity();

                    // Transform
                    em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));

                    // Hex data
                    em.AddComponentData(entity, new HexCoord { Q = q, R = r });
                    em.AddComponentData(entity, new BiomeType { Value = biomeId });
                    em.AddComponent<HexTileTag>(entity);

                    // Rendering — each biome uses its own material index
                    RenderMeshUtility.AddComponents(
                        entity,
                        em,
                        renderMeshDescription,
                        renderMeshArray,
                        MaterialMeshInfo.FromRenderMeshArrayIndices(biomeId, 0)
                    );

                    spawned++;
                }
            }

            pixels.Dispose();
            Debug.Log($"[HexSpawnSystem] Spawned {spawned} hex tile entities (map {mapSize}x{mapSize}, seed {seed})");

            // DEBUG: spawn one visible GameObject hex at origin to verify mesh/camera
            var debugGO = new GameObject("DebugHex");
            var debugMF = debugGO.AddComponent<MeshFilter>();
            var debugMR = debugGO.AddComponent<MeshRenderer>();
            debugMF.mesh = hexMesh;
            debugMR.material = biomeMaterials[BiomeGenerator.BIOME_GRASS];
            debugGO.transform.position = new Vector3(0, 0, 0);
            Debug.Log("[HexSpawnSystem] DEBUG: placed green hex GameObject at origin");

            // Debug: log components on first entity to verify rendering setup
            var query = state.EntityManager.CreateEntityQuery(typeof(HexTileTag));
            if (query.CalculateEntityCount() > 0)
            {
                var entities = query.ToEntityArray(Allocator.Temp);
                var first = entities[0];
                var types = state.EntityManager.GetComponentTypes(first);
                var sb = new System.Text.StringBuilder("[HexSpawnSystem] First entity components: ");
                foreach (var t in types)
                    sb.Append(t.GetManagedType()?.Name ?? "?").Append(", ");
                Debug.Log(sb.ToString());
                types.Dispose();
                entities.Dispose();
            }
        }
    }
}
