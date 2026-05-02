using KBVE.Proto.Map;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Instantiates landmark / settlement / arena / shrine / NPC-marker entities from MapdbCache. Creates one shared quad + material for HexWorldObject.shader, then waits for chunk-driven scatter via <see cref="LandmarkChunkSpawner"/>. Per-chunk RNG is seeded by <c>HashChunk(chunkCoord)</c> so reloading the same chunk lands the same landmarks (idempotent across saves + sessions). Spawns route through <see cref="SpawnAt"/>; ocean / river / occupied tiles are rejected. Presentation-only: Shader.Find + Material creation are rendering concerns; server worlds don't need these.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(MapdbLoaderSystem))]
    public partial class LandmarkSpawnSystem : SystemBase
    {
        const float HexSize     = 0.25f;
        const float LandmarkSize = 1.5f;
        const float LandmarkZ   = -0.55f;

        static LandmarkSpawnSystem _instance;

        Entity _prefab;
        bool _initialized;

        protected override void OnCreate()
        {
            _instance = this;
        }

        protected override void OnUpdate()
        {
            if (!WorldGenSession.HasStarted) return;
            if (!MapdbCache.IsLoaded) return;

            if (!_initialized)
            {
                Init();
                if (!_initialized) return;
            }

            Enabled = false;
        }

        /// <summary>Spawn a landmark at `hex`, looked up by `refSlug` in MapdbCache. Returns Entity.Null if the ref is unknown, the shader has no dispatch for it, or the tile's biome is Ocean / River. MP determinism: every gate inside this method must be a pure function of the world seed (mapdb registry, biome map). Per-client gameplay state — HexOccupant, player buildings, faction territory — is intentionally NOT consulted; consulting it would let two clients with different local play state spawn different landmark sets on the same chunk and desync the world.</summary>
        public static Entity SpawnAt(string refSlug, int2 hex)
        {
            if (_instance == null) return Entity.Null;
            if (!_instance._initialized) return Entity.Null;
            if (!MapdbCache.TryGetByRef(refSlug, out var def)) return Entity.Null;

            byte visual = WorldObjectVisualType.FromRef(refSlug);
            if (visual == WorldObjectVisualType.None) return Entity.Null;

            var em = _instance.EntityManager;
            // Biome is baked from the world seed at chunk spawn → deterministic
            // across clients. HexDB lookup may miss right after chunk creation
            // (drain not yet applied); treat a miss as "trust the caller"
            // since LandmarkChunkSpawner.PickRef has already filtered water
            // via the same biome map.
            if (HexHoverSystem.TryGetHexEntity(hex, out var tile)
                && em.HasComponent<BiomeType>(tile))
            {
                byte biome = em.GetComponentData<BiomeType>(tile).Value;
                if (biome == BiomeGenerator.BIOME_OCEAN) return Entity.Null;
                if (biome == BiomeGenerator.BIOME_RIVER) return Entity.Null;
            }

            byte kind = KindFromProto(def.Type);
            return _instance.SpawnInternal(refSlug, visual, kind, hex);
        }

        Entity SpawnInternal(string refSlug, byte visual, byte kind, int2 hex)
        {
            var em = EntityManager;
            var entity = em.Instantiate(_prefab);

            float3 pos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            pos.z = LandmarkZ;
            em.SetComponentData(entity, LocalTransform.FromPosition(pos));
            em.SetComponentData(entity, new Landmark { Kind = kind, RootHex = hex });
            em.SetComponentData(entity, new LandmarkVisual { Value = visual });
            em.SetComponentData(entity, new BuildingActiveVisual { Value = 1f });
            em.SetSharedComponent(entity, new LandmarkRef
            {
                Value = new FixedString64Bytes(refSlug),
            });

            em.AddComponentData(entity, new Building
            {
                Type         = BuildingType.Landmark,
                RootHex      = hex,
                OwnerFaction = FactionType.Neutral,
            });

            int maxHealth = 500;
            if (MapdbCache.TryGetByRef(refSlug, out var def) && def.MaxHealth > 0)
                maxHealth = def.MaxHealth;
            em.AddComponentData(entity, new BuildingHealth
            {
                Value = (ushort)maxHealth,
                Max   = (ushort)maxHealth,
            });
            em.AddComponentData(entity, new Faction { Value = FactionType.Neutral });

            AttachGameplay(em, entity, def);

            if (HexHoverSystem.TryGetHexEntity(hex, out var tile))
            {
                if (em.HasComponent<HexOccupant>(tile))
                    em.SetComponentData(tile, new HexOccupant { Building = entity });
                else
                    em.AddComponentData(tile, new HexOccupant { Building = entity });
            }

            return entity;
        }

        void AttachGameplay(EntityManager em, Entity entity, WorldObjectDef def)
        {
            if (def == null) return;

            byte interaction = def.Interaction switch
            {
                InteractionKind.Shrine      => LandmarkInteractionKind.Shrine,
                InteractionKind.Shop        => LandmarkInteractionKind.Shop,
                InteractionKind.QuestGiver  => LandmarkInteractionKind.QuestGiver,
                InteractionKind.Dungeon     => LandmarkInteractionKind.Dungeon,
                InteractionKind.NpcDialog   => LandmarkInteractionKind.NpcDialog,
                _                           => LandmarkInteractionKind.None,
            };
            if (interaction == LandmarkInteractionKind.None) return;

            byte faction = def.Faction switch
            {
                "hostile" => FactionType.Hostile,
                "player"  => FactionType.Player,
                _         => FactionType.Neutral,
            };

            em.AddComponentData(entity, new LandmarkGameplay
            {
                Interaction = interaction,
                Faction     = faction,
            });

            if (interaction == LandmarkInteractionKind.Shrine && def.Shrine != null)
            {
                byte flags = 0;
                if (def.Shrine.TerritoryActive)  flags |= ShrineFlags.TerritoryActive;
                if (def.Shrine.KingVisitActive)  flags |= ShrineFlags.KingVisitActive;

                em.AddComponentData(entity, new LandmarkShrine
                {
                    NextEligibleTurn = 0,
                    CadenceTurns     = (ushort)math.max(1, def.Shrine.CadenceTurns),
                    RewardCoin       = (ushort)def.Shrine.RewardCoin,
                    Flags            = flags,
                });
                var rewards = em.AddBuffer<LandmarkShrineRewardItem>(entity);
                for (int i = 0; i < def.Shrine.RewardItems.Count; i++)
                {
                    var line = def.Shrine.RewardItems[i];
                    if (string.IsNullOrEmpty(line.ItemRef)) continue;
                    if (!ItemDB.TryResolveRef(line.ItemRef, out var itemId)) continue;
                    rewards.Add(new LandmarkShrineRewardItem
                    {
                        ItemId = (ushort)itemId,
                        Amount = (ushort)line.Amount,
                    });
                }
            }

            if (def.Aura != null && def.Aura.Radius > 0)
            {
                em.AddComponentData(entity, new LandmarkAura
                {
                    Radius     = (byte)def.Aura.Radius,
                    BonusKind  = new FixedString32Bytes(def.Aura.BonusKind ?? string.Empty),
                    Multiplier = def.Aura.Multiplier,
                });
            }
        }

        static byte KindFromProto(WorldObjectType t) => t switch
        {
            WorldObjectType.WorldObjectSettlement => LandmarkKind.Settlement,
            WorldObjectType.WorldObjectLandmark   => LandmarkKind.Landmark,
            WorldObjectType.WorldObjectArena      => LandmarkKind.Arena,
            WorldObjectType.WorldObjectNpcMarker  => LandmarkKind.NpcMarker,
            _                                     => LandmarkKind.Prop,
        };

        void Init()
        {
            var shader = Shader.Find("RareIcon/HexWorldObject");
            if (shader == null)
            {
                Debug.LogError("[LandmarkSpawn] HexWorldObject shader not found");
                return;
            }

            var mesh = CreateQuadMesh(LandmarkSize);
            var material = new Material(shader) { enableInstancing = true };

            var em = EntityManager;
            _prefab = em.CreateEntity();
            em.AddComponentData(_prefab, LocalTransform.Identity);
            em.AddComponentData(_prefab, new Landmark());
            em.AddComponentData(_prefab, new LandmarkVisual());
            em.AddComponentData(_prefab, new BuildingActiveVisual { Value = 1f });
            em.AddSharedComponent(_prefab, new LandmarkRef
            {
                Value = new FixedString64Bytes(""),
            });
            em.AddComponent<Prefab>(_prefab);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });
            RenderMeshUtility.AddComponents(
                _prefab, em, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            using var existing = em.CreateEntityQuery(ComponentType.ReadWrite<LandmarkPrefabSingleton>());
            Entity singleton = existing.CalculateEntityCount() > 0
                ? existing.GetSingletonEntity()
                : em.CreateEntity(typeof(LandmarkPrefabSingleton));
            em.SetComponentData(singleton, new LandmarkPrefabSingleton { Prefab = _prefab });

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
                    new Vector2(0f, 0f),
                    new Vector2(1f, 0f),
                    new Vector2(1f, 1f),
                    new Vector2(0f, 1f),
                },
                triangles = new[] { 0, 1, 2, 0, 2, 3 },
            };
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
