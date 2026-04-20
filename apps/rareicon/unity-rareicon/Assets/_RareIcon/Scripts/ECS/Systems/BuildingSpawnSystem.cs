using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Consumes BuildCityRequest message entities and spawns a Capital
    /// building from a shared prefab. Validates the 7-hex flower claim
    /// (centre + 6 axial neighbours) before anything is created — if
    /// any target hex is already occupied or missing, the request is
    /// dropped and the player's city token is preserved so they can
    /// retry after cancelling build mode.
    ///
    /// Managed SystemBase because prefab init needs Shader.Find + a
    /// Mesh + Material + RenderMeshUtility.AddComponents. Spawn itself
    /// is a handful of EntityManager ops per request; fine at the rate
    /// a player hand-places cities.
    /// </summary>
    [UpdateInGroup(typeof(MovementSystemGroup))]
    public partial class BuildingSpawnSystem : SystemBase
    {
        const float HexSize      = 0.25f;
        const float BuildingSize = 1.5f;    // quad covers the 7-hex flower
        const float BuildingZ    = -0.6f;   // between tiles and units

        // Same axial offsets as BuildPreviewSystem — keep these in sync.
        static readonly int2[] FlowerOffsets =
        {
            new int2( 0,  0), // centre
            new int2( 1,  0), // E
            new int2( 1, -1), // NE
            new int2( 0, -1), // NW
            new int2(-1,  0), // W
            new int2(-1,  1), // SW
            new int2( 0,  1), // SE
        };

        Entity _capitalPrefab;
        bool _initialized;

        protected override void OnCreate()
        {
            RequireForUpdate<BuildCityRequest>();
        }

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                Init();
                if (!_initialized) return;
            }

            var em = EntityManager;
            var ecb = new EntityCommandBuffer(Unity.Collections.Allocator.Temp);

            // Pull the player entity + ability counter once per update; most
            // frames have zero or one build request.
            Entity playerEntity = Entity.Null;
            PlayerAbilities playerAbilities = default;
            bool hasPlayer = false;
            foreach (var (abilities, entity) in
                SystemAPI.Query<RefRO<PlayerAbilities>>().WithAll<PlayerTag>().WithEntityAccess())
            {
                playerEntity = entity;
                playerAbilities = abilities.ValueRO;
                hasPlayer = true;
                break;
            }

            foreach (var (reqRef, reqEntity) in
                SystemAPI.Query<RefRO<BuildCityRequest>>().WithEntityAccess())
            {
                var req = reqRef.ValueRO;

                // Out of tokens — drop silently.
                if (!hasPlayer || playerAbilities.CityBuildsRemaining <= 0)
                {
                    Debug.Log("[BuildingSpawnSystem] Build rejected: no city tokens remaining");
                    ecb.DestroyEntity(reqEntity);
                    continue;
                }

                // Validate the 7 target hexes. All must:
                //   - exist in the hex lookup (off-map / ocean rejected — ocean
                //     tiles aren't spawned as entities so TryGetHexEntity fails)
                //   - not already be claimed by another building
                //   - not be a river tile (rivers are land entities but flooded)
                bool valid = true;
                string rejectReason = null;
                for (int i = 0; i < FlowerOffsets.Length; i++)
                {
                    var hex = req.CenterHex + FlowerOffsets[i];
                    if (!HexHoverSystem.TryGetHexEntity(hex, out var tileEntity))
                    {
                        valid = false;
                        rejectReason = "off-map or ocean tile";
                        break;
                    }
                    if (em.HasComponent<HexOccupant>(tileEntity))
                    {
                        valid = false;
                        rejectReason = "tile already occupied";
                        break;
                    }
                    if (em.HasComponent<BiomeType>(tileEntity))
                    {
                        byte biome = em.GetComponentData<BiomeType>(tileEntity).Value;
                        if (biome == BiomeGenerator.BIOME_OCEAN ||
                            biome == BiomeGenerator.BIOME_RIVER)
                        {
                            valid = false;
                            rejectReason = "water tile (ocean or river)";
                            break;
                        }
                    }
                }
                if (!valid)
                {
                    Debug.Log($"[BuildingSpawnSystem] Build rejected: {rejectReason}");
                    ecb.DestroyEntity(reqEntity);
                    continue;
                }

                // Spawn the capital at the centre hex's world position.
                float3 pos = HexMeshUtil.HexToWorld(req.CenterHex.x, req.CenterHex.y, HexSize);
                pos.z = BuildingZ;

                var building = ecb.Instantiate(_capitalPrefab);
                ecb.SetComponent(building, LocalTransform.FromPosition(pos));
                ecb.SetComponent(building, new Building
                {
                    Type         = BuildingType.Capital,
                    RootHex      = req.CenterHex,
                    OwnerFaction = req.OwnerFaction,
                });
                ecb.SetComponent(building, new BuildingVisual { Value = BuildingType.Capital });
                // Central storage — ally goblins drain their harvest
                // buffer into this one when they walk onto any of the
                // 7 capital hexes. Buffer is inherited from the prefab
                // and starts empty; slots are either merged (same
                // ItemId) or appended as the capital collects more
                // kinds of loot. See GoblinDepositSystem.

                // Claim all 7 tiles — HexOccupant on each tile points back
                // at the building so future queries can traverse either way.
                for (int i = 0; i < FlowerOffsets.Length; i++)
                {
                    var hex = req.CenterHex + FlowerOffsets[i];
                    HexHoverSystem.TryGetHexEntity(hex, out var tileEntity);
                    ecb.AddComponent(tileEntity, new HexOccupant { Building = building });
                }

                // Decrement the player's token.
                playerAbilities.CityBuildsRemaining -= 1;
                ecb.SetComponent(playerEntity, playerAbilities);

                ecb.DestroyEntity(reqEntity);
            }

            ecb.Playback(em);
            ecb.Dispose();
        }

        void Init()
        {
            var shader = Shader.Find("RareIcon/HexBuilding");
            if (shader == null)
            {
                Debug.LogError("[BuildingSpawnSystem] HexBuilding shader not found");
                return;
            }

            var mesh = CreateQuadMesh(BuildingSize);
            var material = new Material(shader) { enableInstancing = true };

            var em = EntityManager;
            _capitalPrefab = em.CreateEntity();
            em.AddComponentData(_capitalPrefab, LocalTransform.Identity);
            em.AddComponentData(_capitalPrefab, new Building());
            em.AddComponentData(_capitalPrefab, new BuildingVisual());
            // Prefab buffer so Instantiate preserves the storage buffer
            // shape on each spawn (we still AddBuffer on spawn too so
            // the component definitely exists — belt-and-suspenders).
            em.AddBuffer<InventorySlot>(_capitalPrefab);
            em.AddComponent<Prefab>(_capitalPrefab);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });
            RenderMeshUtility.AddComponents(
                _capitalPrefab, em, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            _initialized = true;
        }

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
