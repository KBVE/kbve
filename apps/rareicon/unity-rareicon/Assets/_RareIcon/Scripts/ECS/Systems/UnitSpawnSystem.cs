using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Optional restore state for ghost units pulled from the Rust persistence store; default = fresh NPCDB spawn.</summary>
    // TODO(rust-ffi): extend with Hunger/Fatigue/Energy current values + ReliefIntent.Kind so ghost-restore picks up mid-loop state, not just HP + inventory. Struct must stay blittable and mirror a repr(C) Rust equivalent.
    public struct UnitSpawnState
    {
        public float Health;
        public float MaxHealth;
        public ushort Inv0Id, Inv0Qty;
        public ushort Inv1Id, Inv1Qty;
        public ushort Inv2Id, Inv2Qty;
        public ushort Inv3Id, Inv3Qty;
    }

    /// <summary>Spawns the initial King + ally-goblin cluster and exposes static spawn helpers for chunk-reload + hostile waves.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class UnitSpawnSystem : SystemBase
    {
        const float HexSize = 0.25f;
        const float UnitSize = 0.5f;
        const int   GoblinCount  = 16;
        const int   SpawnRadius  = 8;

        static Mesh                  _mesh;
        static Material              _material;
        static RenderMeshDescription _renderDesc;
        static RenderMeshArray       _renderArray;
        static bool                  _renderAssetsReady;

        bool _spawned;

        protected override void OnUpdate()
        {
            if (_spawned) return;
            _spawned = true;

            if (!EnsureRenderAssets()) return;

            SpawnKingAt(EntityManager, new int2(0, 0));

            for (int i = 0; i < GoblinCount; i++)
            {
                uint h = (uint)(i + 1) * 0x9E3779B1u;
                h ^= h >> 13;
                h *= 0x85EBCA77u;
                int span = SpawnRadius * 2 + 1;
                int q = (int)(h % (uint)span) - SpawnRadius;
                int r = (int)((h >> 16) % (uint)span) - SpawnRadius;
                uint rng = h * 0xC2B2AE3Du ^ ((uint)i * 0x27D4EB2Fu);
                SpawnGoblinAt(EntityManager, new int2(q, r), rng);
            }
        }

        /// <summary>Spawn a goblin at the given hex with the given faction; pass state to restore a ghost unit.</summary>
        public static Entity SpawnGoblinAt(EntityManager em, int2 hex, uint rngSeed,
                                           UnitSpawnState state = default,
                                           byte faction = FactionType.Player)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.Goblin);

            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,
                Weapon = def.DefaultWeapon,
            });

            if (def.MaxHealth > 0)
            {
                float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
                float hp    = state.Health    > 0f ? state.Health    : maxHp;
                em.AddComponentData(entity, new Health { Value = hp, Max = maxHp });
                if (def.HealthRegen != 0f)
                    em.AddComponentData(entity, new HealthRegen { PerSecond = def.HealthRegen });
            }
            if (def.MaxEnergy > 0)
            {
                em.AddComponentData(entity, new Energy { Value = def.MaxEnergy, Max = def.MaxEnergy });
                if (def.EnergyRegen != 0f)
                    em.AddComponentData(entity, new EnergyRegen { PerSecond = def.EnergyRegen });
            }
            if (def.MaxMana > 0)
            {
                em.AddComponentData(entity, new Mana { Value = def.MaxMana, Max = def.MaxMana });
                if (def.ManaRegen != 0f)
                    em.AddComponentData(entity, new ManaRegen { PerSecond = def.ManaRegen });
            }

            em.AddComponentData(entity, new UnitVisual        { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual  { Value = (float)def.DefaultWeapon });
            em.AddComponentData(entity, new UnitFacingVisual  { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual  { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = faction });
            em.AddComponentData(entity, new Collidable { Radius = 0.20f });

            AttachRangedAttackIfArmed(em, entity, def.DefaultWeapon);
            AttachNeedsIfPlayer(em, entity, faction, def);

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.8f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.4f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex  = hex,
                TargetHex   = hex,
                MoveSpeed   = def.MoveSpeed * speedJit,
                Facing      = UnitFacing.East,
                RandomState = rngSeed | 1u,
                WanderStep  = 0u,
                DwellTimer  = (rngSeed % 100u) / 200f,
                LastDir     = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            var inv = em.AddBuffer<InventorySlot>(entity);
            if (state.Inv0Id != 0 && state.Inv0Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv0Id, Count = state.Inv0Qty });
            if (state.Inv1Id != 0 && state.Inv1Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv1Id, Count = state.Inv1Qty });
            if (state.Inv2Id != 0 && state.Inv2Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv2Id, Count = state.Inv2Qty });
            if (state.Inv3Id != 0 && state.Inv3Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv3Id, Count = state.Inv3Qty });

            em.AddComponent<UnitTestTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn the player-controlled King at the given hex; there is exactly one in the world.</summary>
        public static Entity SpawnKingAt(EntityManager em, int2 hex,
                                         UnitSpawnState state = default)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.King);

            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,
                Weapon = def.DefaultWeapon,
            });

            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health     { Value = hp,            Max = maxHp });
            em.AddComponentData(entity, new HealthRegen { PerSecond = def.HealthRegen });
            em.AddComponentData(entity, new Energy     { Value = def.MaxEnergy, Max = def.MaxEnergy });
            em.AddComponentData(entity, new EnergyRegen { PerSecond = def.EnergyRegen });
            em.AddComponentData(entity, new Mana       { Value = def.MaxMana,   Max = def.MaxMana });
            em.AddComponentData(entity, new ManaRegen  { PerSecond = def.ManaRegen });

            em.AddComponentData(entity, new UnitVisual        { Value = (float)UnitType.Soldier });
            em.AddComponentData(entity, new UnitWeaponVisual  { Value = (float)def.DefaultWeapon });
            em.AddComponentData(entity, new UnitFacingVisual  { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitHelmetVisual  { Value = (float)HelmetType.Cap });
            em.AddComponentData(entity, new UnitMovingVisual  { Value = 0f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Player });
            em.AddComponentData(entity, new Collidable { Radius = 0.22f });

            AttachRangedAttackIfArmed(em, entity, def.DefaultWeapon);
            AttachNeedsIfPlayer(em, entity, FactionType.Player, def);

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed,
                Facing          = UnitFacing.East,
                RandomState     = 0xC0FFEE01u,
                WanderStep      = 0u,
                DwellTimer      = 0f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            var inv = em.AddBuffer<InventorySlot>(entity);
            if (state.Inv0Id != 0 && state.Inv0Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv0Id, Count = state.Inv0Qty });
            if (state.Inv1Id != 0 && state.Inv1Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv1Id, Count = state.Inv1Qty });
            if (state.Inv2Id != 0 && state.Inv2Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv2Id, Count = state.Inv2Qty });
            if (state.Inv3Id != 0 && state.Inv3Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv3Id, Count = state.Inv3Qty });

            // Founding charter — only seeded on the FRESH spawn (state has
            // no inventory). Ghost-restore preserves its own inventory and
            // a returning King shouldn't get a duplicate grant. Once the
            // Capital is placed the grant is consumed; future Royal Decree
            // / event items can re-grant the privilege.
            bool freshSpawn = state.Inv0Id == 0 && state.Inv1Id == 0
                           && state.Inv2Id == 0 && state.Inv3Id == 0;
            if (freshSpawn)
                inv.Add(new InventorySlot { ItemId = (ushort)ItemId.CapitalLandGrant, Count = 1 });

            em.AddComponent<KingTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        // Lazily creates the shared render assets the first time anything
        static bool EnsureRenderAssets()
        {
            if (_renderAssetsReady) return true;

            var shader = Shader.Find("RareIcon/HexUnit");
            if (shader == null)
            {
                Debug.LogError("[UnitSpawnSystem] HexUnit shader not found");
                return false;
            }

            _mesh = CreateQuadMesh(UnitSize);
            _material = new Material(shader) { enableInstancing = true };
            _renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            _renderArray = new RenderMeshArray(new[] { _material }, new[] { _mesh });

            _renderAssetsReady = true;
            return true;
        }

        static void AttachNeedsIfPlayer(EntityManager em, Entity entity, byte faction, NPCDef def)
        {
            if (faction != FactionType.Player) return;
            if (def.MaxHunger > 0f)
            {
                em.AddComponentData(entity, new Hunger
                {
                    Value     = 0f,
                    Max       = def.MaxHunger,
                    PerSecond = def.HungerPerSec,
                });
            }
            if (def.MaxFatigue > 0f)
            {
                em.AddComponentData(entity, new Fatigue
                {
                    Value     = 0f,
                    Max       = def.MaxFatigue,
                    PerSecond = def.FatiguePerSec,
                });
            }
            em.AddComponentData(entity, new ReliefIntent
            {
                Kind    = ReliefKind.None,
                Urgency = 0f,
            });
        }

        static void AttachRangedAttackIfArmed(EntityManager em, Entity entity, byte weapon)
        {
            if (weapon == WeaponType.Crossbow)
            {
                em.AddComponentData(entity, new RangedAttack
                {
                    Range              = 3.0f,
                    Damage             = 8.0f,
                    Cooldown           = 1.5f,
                    TimeSinceShot      = 0f,
                    ProjectileType     = ProjectileType.Bolt,
                    ProjectileMod      = ArrowMod.None,
                    ProjectileSpeed    = 6.0f,
                    ProjectileLifetime = 2.5f,
                });
            }
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
