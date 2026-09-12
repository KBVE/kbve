using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Optional restore state for ghost units pulled from the Rust persistence store; default = fresh NPCDB spawn.</summary>

    public struct UnitSpawnState
    {
        public float Health;
        public float MaxHealth;
        public ushort Inv0Id, Inv0Qty;
        public ushort Inv1Id, Inv1Qty;
        public ushort Inv2Id, Inv2Qty;
        public ushort Inv3Id, Inv3Qty;
        public byte Strength, Agility, Intellect, Will;
        public byte HasAttributes;
    }


    /// <summary>Spawns the initial King + ally-goblin cluster and exposes static spawn helpers for chunk-reload + hostile waves.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class UnitSpawnSystem : SystemBase
    {
        const float HexSize = 0.25f;
        const float UnitSize = 0.5f;
        const int   GoblinCount  = 250;
        const int   SpawnRadius  = 18;

        static Mesh                  _mesh;
        static Material              _material;
        static Material              _heroMaterial;
        static RenderMeshDescription _renderDesc;
        static RenderMeshArray       _renderArray;
        static bool                  _renderAssetsReady;
        static bool                  _heroMaterialReady;

        bool _spawned;

        /// <summary>WorldResetService bumps this on Return-to-Title so the next OnUpdate re-runs the initial spawn loop. Static + read once per OnUpdate keeps the reset cross-system without holding a reference back to the SystemBase.</summary>
        public static int RespawnGeneration;
        int _spawnedAtGeneration;

        /// <summary>True while the one-shot initial spawn loop runs; <see cref="PublishTraitToast"/> reads this and skips publishing so the king's starting retinue doesn't fire "Hero born" toasts. New heroes (barracks recruitment, settler arrival) spawn after the loop completes and toast normally.</summary>
        static bool _suppressTraitToasts;

        protected override void OnUpdate()
        {
            if (!WorldGenSession.HasStarted) return;

            if (!MultiplayerAuthority.IsAuthority) return;
            if (RespawnGeneration != _spawnedAtGeneration) _spawned = false;
            if (_spawned) return;
            _spawned = true;
            _spawnedAtGeneration = RespawnGeneration;

            if (!EnsureRenderAssets()) return;

            _suppressTraitToasts = true;
            try
            {

            int2 anchor = FindNearestLandHex(int2.zero);

            SpawnKingAt(EntityManager, anchor);

            SpawnGuardGoblinAt(EntityManager, NearestLand(anchor + new int2( 1,  0)), 0xA110C8u);
            SpawnGuardGoblinAt(EntityManager, NearestLand(anchor + new int2(-1,  0)), 0xB22199u);
            SpawnGuardGoblinAt(EntityManager, NearestLand(anchor + new int2( 0,  1)), 0xC332AAu);
            SpawnGuardGoblinAt(EntityManager, NearestLand(anchor + new int2( 0, -1)), 0xD443BBu);

            SpawnHeroAt(EntityManager, NearestLand(anchor + new int2( 2,  0)), 0x1001A1u, HeroRole.MasterBlacksmith);
            SpawnHeroAt(EntityManager, NearestLand(anchor + new int2(-2,  0)), 0x1002B2u, HeroRole.MasterCraftsman);
            SpawnGoblinAt(EntityManager, NearestLand(anchor + new int2( 0,  2)), 0x1003C3u, default, FactionType.Player, UnitType.Soldier);
            SpawnGoblinAt(EntityManager, NearestLand(anchor + new int2( 0, -2)), 0x1004D4u, default, FactionType.Player, UnitType.Soldier);
            SpawnGoblinAt(EntityManager, NearestLand(anchor + new int2( 2, -2)), 0x1005E5u, default, FactionType.Player, UnitType.Soldier);
            SpawnGoblinAt(EntityManager, NearestLand(anchor + new int2(-2,  2)), 0x1006F6u, default, FactionType.Player, UnitType.Mage);

            SpawnArcherSoldierAt(EntityManager, NearestLand(anchor + new int2( 3,  0)), 0x2001A1u);
            SpawnArcherSoldierAt(EntityManager, NearestLand(anchor + new int2(-3,  0)), 0x2002B2u);
            SpawnArcherSoldierAt(EntityManager, NearestLand(anchor + new int2( 0,  3)), 0x2003C3u);
            SpawnArcherSoldierAt(EntityManager, NearestLand(anchor + new int2( 0, -3)), 0x2004D4u);
            SpawnArcherSoldierAt(EntityManager, NearestLand(anchor + new int2( 3, -3)), 0x2005E5u);

            for (int i = 0; i < GoblinCount; i++)
            {
                uint h = UnitHashOps.Spread((uint)(i + 1));
                int span = SpawnRadius * 2 + 1;
                int q = (int)(h % (uint)span) - SpawnRadius;
                int r = (int)((h >> 16) % (uint)span) - SpawnRadius;
                uint rng = h * 0xC2B2AE3Du ^ ((uint)i * 0x27D4EB2Fu);
                int2 candidate = anchor + new int2(q, r);
                if (!IsLandHex(candidate)) continue;
                SpawnGoblinAt(EntityManager, candidate, rng);
            }

            }
            finally { _suppressTraitToasts = false; }
        }

        /// <summary>Spawn a humanoid (defaults to Goblin) at the given hex with the given faction. Used for garrisons, ghost-unit restore, and Barracks recruitment (Soldier).</summary>
        public static Entity SpawnGoblinAt(EntityManager em, int2 hex, uint rngSeed,
                                           UnitSpawnState state = default,
                                           byte faction  = FactionType.Player,
                                           byte unitType = UnitType.Goblin)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(unitType);

            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));

            var equipment = EquipmentLoadoutResolver.Resolve(
                unitType,
                out byte shieldSlot,
                out byte weaponByte,
                out byte helmetByte,
                out byte armorByte);

            if (weaponByte == WeaponType.None) weaponByte = def.DefaultWeapon;

            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,
                Weapon = weaponByte,
                Helmet = helmetByte,
                Shield = shieldSlot,
                Armor  = armorByte,
            });
            em.AddComponentData(entity, equipment);

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
            em.AddComponentData(entity, new UnitWeaponVisual  { Value = (float)weaponByte });
            em.AddComponentData(entity, new UnitShieldVisual  { Value = (float)shieldSlot });
            em.AddComponentData(entity, new UnitArmorVisual   { Value = (float)armorByte });
            em.AddComponentData(entity, new UnitFacingVisual  { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual  { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = faction });
            em.AddComponentData(entity, new Collidable { Radius = 0.20f });

            AttachRangedAttackIfArmed(em, entity, def.DefaultWeapon);
            AttachMeleeAttackIfArmed(em, entity, def.DefaultWeapon, faction);
            AttachSpellsIfMagical(em, entity, def.UnitType, faction);
            AttachNeedsIfPlayer(em, entity, faction, def, rngSeed);
            AttachJobsIfPlayer(em, entity, faction, def.UnitType, rngSeed);
            AttachTraitsIfApplicable(em, entity, def.UnitType, faction, rngSeed);

            if (faction == FactionType.Player)
            {
                var (firstId, epithetId) = UnitNaming.GenerateGoblin(rngSeed);
                em.AddComponentData(entity, new UnitName
                {
                    FirstNameId = firstId,
                    EpithetId   = epithetId,
                });
            }

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

            em.AddBuffer<EquippedBag>(entity);
            var pack = em.AddBuffer<PackSlot>(entity);
            if (state.Inv0Id != 0 && state.Inv0Qty > 0) pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = state.Inv0Id, Count = state.Inv0Qty });
            if (state.Inv1Id != 0 && state.Inv1Qty > 0) pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = state.Inv1Id, Count = state.Inv1Qty });
            if (state.Inv2Id != 0 && state.Inv2Qty > 0) pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = state.Inv2Id, Count = state.Inv2Qty });
            if (state.Inv3Id != 0 && state.Inv3Qty > 0) pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = state.Inv3Id, Count = state.Inv3Qty });

            em.AddComponent<UnitTestTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Player goblin armed with a crossbow and Guard=5 priority over its archetype preferences.</summary>
        public static Entity SpawnGuardGoblinAt(EntityManager em, int2 hex, uint rngSeed)
        {
            var entity = SpawnGoblinAt(em, hex, rngSeed, default, FactionType.Player);
            if (entity == Entity.Null) return Entity.Null;

            em.SetComponentData(entity, new Unit
            {
                Type   = UnitType.Goblin,
                Weapon = WeaponType.Crossbow,
            });
            em.SetComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.Crossbow });
            AttachRangedAttackIfArmed(em, entity, WeaponType.Crossbow);

            var priorities = em.GetComponentData<ProfessionPriorities>(entity);
            priorities.Guard = 5;
            em.SetComponentData(entity, priorities);

            var pack = em.GetBuffer<PackSlot>(entity);
            pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Arrow, Count = ArcherRefillConfig.QuiverMax });
            return entity;
        }

        /// <summary>Spawn a Player Soldier armed with a crossbow — human archer.</summary>
        public static Entity SpawnArcherSoldierAt(EntityManager em, int2 hex, uint rngSeed)
        {
            var entity = SpawnGoblinAt(em, hex, rngSeed, default, FactionType.Player, UnitType.Soldier);
            if (entity == Entity.Null) return Entity.Null;

            em.SetComponentData(entity, new Unit
            {
                Type   = UnitType.Soldier,
                Weapon = WeaponType.Crossbow,
            });
            em.SetComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.Crossbow });
            AttachRangedAttackIfArmed(em, entity, WeaponType.Crossbow);

            var pack = em.GetBuffer<PackSlot>(entity);
            pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Arrow, Count = ArcherRefillConfig.QuiverMax });
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

            var kingEquipment = EquipmentLoadoutResolver.Resolve(
                def.UnitType,
                out byte kingShield,
                out byte kingWeapon,
                out byte kingHelmet,
                out byte kingArmor);

            if (kingWeapon == WeaponType.None) kingWeapon = def.DefaultWeapon;
            if (kingHelmet == HelmetType.None) kingHelmet = HelmetType.Cap;

            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,
                Weapon = kingWeapon,
                Helmet = kingHelmet,
                Shield = kingShield,
                Armor  = kingArmor,
            });
            em.AddComponentData(entity, kingEquipment);

            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health     { Value = hp,            Max = maxHp });
            em.AddComponentData(entity, new HealthRegen { PerSecond = def.HealthRegen });
            em.AddComponentData(entity, new Energy     { Value = def.MaxEnergy, Max = def.MaxEnergy });
            em.AddComponentData(entity, new EnergyRegen { PerSecond = def.EnergyRegen });
            em.AddComponentData(entity, new Mana       { Value = def.MaxMana,   Max = def.MaxMana });
            em.AddComponentData(entity, new ManaRegen  { PerSecond = def.ManaRegen });

            em.AddComponentData(entity, new UnitVisual        { Value = (float)UnitType.Soldier });
            em.AddComponentData(entity, new UnitWeaponVisual  { Value = (float)kingWeapon });
            em.AddComponentData(entity, new UnitShieldVisual  { Value = (float)kingShield });
            em.AddComponentData(entity, new UnitArmorVisual   { Value = (float)kingArmor });
            em.AddComponentData(entity, new UnitFacingVisual  { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitHelmetVisual  { Value = (float)kingHelmet });
            em.AddComponentData(entity, new UnitMovingVisual  { Value = 0f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Player });
            em.AddComponentData(entity, new Collidable { Radius = 0.22f });

            AttachRangedAttackIfArmed(em, entity, def.DefaultWeapon);
            AttachNeedsIfPlayer(em, entity, FactionType.Player, def);
            AttachJobsIfPlayer(em, entity, FactionType.Player, def.UnitType);

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

            em.AddBuffer<EquippedBag>(entity);
            var pack = em.AddBuffer<PackSlot>(entity);
            if (state.Inv0Id != 0 && state.Inv0Qty > 0) pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = state.Inv0Id, Count = state.Inv0Qty });
            if (state.Inv1Id != 0 && state.Inv1Qty > 0) pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = state.Inv1Id, Count = state.Inv1Qty });
            if (state.Inv2Id != 0 && state.Inv2Qty > 0) pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = state.Inv2Id, Count = state.Inv2Qty });
            if (state.Inv3Id != 0 && state.Inv3Qty > 0) pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = state.Inv3Id, Count = state.Inv3Qty });

            bool alreadyHasGrant = false;
            for (int s = 0; s < pack.Length; s++)
            {
                if (pack[s].ItemId == (ushort)ItemId.CapitalLandGrant && pack[s].Count > 0)
                {
                    alreadyHasGrant = true;
                    break;
                }
            }
            bool worldHasCapital = false;
            using (var capitalQuery = em.CreateEntityQuery(ComponentType.ReadOnly<CapitalTag>()))
                worldHasCapital = !capitalQuery.IsEmpty;
            if (!alreadyHasGrant && !worldHasCapital)
                pack.Add(new PackSlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.CapitalLandGrant, Count = 1 });

            em.AddComponent<KingTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a passive wild animal (Chicken / Sheep / Cow) at the given hex. Wildlife faction, no weapon, no inventory.</summary>
        public static Entity SpawnAnimalAt(EntityManager em, int2 hex, uint rngSeed, byte unitType,
                                           UnitSpawnState state = default)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(unitType);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = WeaponType.None });

            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health { Value = hp, Max = maxHp });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Wildlife });
            em.AddComponentData(entity, new Collidable { Radius = 0.18f });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.85f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.3f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            em.AddComponent<PassiveAnimalTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Hostile-faction Bandit (humanoid raider) at the given hex. Carries a Club + MeleeAttack with PreferBuildings target mode like the Hostile goblin, but with higher HP / damage so the raid wave has weight.</summary>
        public static Entity SpawnBanditAt(EntityManager em, int2 hex, uint rngSeed,
                                           UnitSpawnState state = default)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.Bandit);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            var equipment = EquipmentLoadoutResolver.Resolve(
                UnitType.Bandit,
                out byte shieldByte,
                out byte weaponByte,
                out byte helmetByte,
                out byte armorByte);
            if (weaponByte == WeaponType.None) weaponByte = def.DefaultWeapon;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,
                Weapon = weaponByte,
                Helmet = helmetByte,
                Shield = shieldByte,
                Armor  = armorByte,
            });
            em.AddComponentData(entity, equipment);

            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health { Value = hp, Max = maxHp });
            if (def.MaxEnergy > 0)
                em.AddComponentData(entity, new Energy { Value = def.MaxEnergy, Max = def.MaxEnergy });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)weaponByte });
            em.AddComponentData(entity, new UnitShieldVisual { Value = (float)shieldByte });
            em.AddComponentData(entity, new UnitArmorVisual  { Value = (float)armorByte });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Hostile });
            em.AddComponentData(entity, new Collidable { Radius = 0.20f });

            em.AddComponentData(entity, new MeleeAttack
            {
                Range         = 0.45f,
                Damage        = 5.0f,
                Cooldown      = 1.1f,
                TimeSinceShot = 0f,
                TargetMode    = MeleeTargetMode.PreferBuildings,
            });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.85f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.3f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Player-faction Scout (humanoid recon) at the given hex. No weapon, fast move speed, light HP. Carries <see cref="ScoutTag"/> so behavior systems can flag it as recon-only (no Hunt, no Harvest); FogBakeSystem reveals fog around any Player unit so the Scout's value is its mobility + survivability.</summary>
        public static Entity SpawnScoutAt(EntityManager em, int2 hex, uint rngSeed)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.Scout);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = WeaponType.None });
            em.AddComponentData(entity, EquipmentLoadoutResolver.Resolve(UnitType.Scout, out _, out _, out _, out _));
            em.AddComponentData(entity, new Health { Value = def.MaxHealth, Max = def.MaxHealth });
            if (def.MaxEnergy > 0)
                em.AddComponentData(entity, new Energy { Value = def.MaxEnergy, Max = def.MaxEnergy });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Player });
            em.AddComponentData(entity, new Collidable { Radius = 0.18f });
            em.AddComponent<ScoutTag>(entity);
            em.AddComponentData(entity, new VisionRadius { Value = 3f });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.95f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.20f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Player-faction Cavalry (mounted melee) at the given hex. Faster move speed than Soldier, mid HP, club melee with PreferUnits target so cavalry chases enemy units rather than bashing walls. <see cref="CavalryTag"/> distinguishes from base humanoid melee for future charge-bonus systems.</summary>
        public static Entity SpawnCavalryAt(EntityManager em, int2 hex, uint rngSeed)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.Cavalry);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = def.DefaultWeapon });
            em.AddComponentData(entity, EquipmentLoadoutResolver.Resolve(UnitType.Cavalry, out _, out _, out _, out _));
            em.AddComponentData(entity, new Health { Value = def.MaxHealth, Max = def.MaxHealth });
            if (def.MaxEnergy > 0)
                em.AddComponentData(entity, new Energy { Value = def.MaxEnergy, Max = def.MaxEnergy });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)def.DefaultWeapon });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Player });
            em.AddComponentData(entity, new Collidable { Radius = 0.22f });
            em.AddComponent<CavalryTag>(entity);

            em.AddComponentData(entity, new MeleeAttack
            {
                Range         = 0.50f,
                Damage        = 7.0f,
                Cooldown      = 1.0f,
                TimeSinceShot = 0f,
                TargetMode    = MeleeTargetMode.PreferUnits,
            });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.95f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.20f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Hostile-faction BanditScout at the given hex. Mirrors <see cref="SpawnScoutAt"/> stat-line but Hostile + carries <see cref="BanditScoutTag"/> for the dispatch / behavior systems. No weapon — the scout flees combat and only reports player buildings into <c>KnownPlayerHexesSingleton</c>.</summary>
        public static Entity SpawnBanditScoutAt(EntityManager em, int2 hex, uint rngSeed)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.BanditScout);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = WeaponType.None });
            em.AddComponentData(entity, EquipmentLoadoutResolver.Resolve(UnitType.BanditScout, out _, out _, out _, out _));
            em.AddComponentData(entity, new Health { Value = def.MaxHealth, Max = def.MaxHealth });
            if (def.MaxEnergy > 0)
                em.AddComponentData(entity, new Energy { Value = def.MaxEnergy, Max = def.MaxEnergy });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Hostile });
            em.AddComponentData(entity, new Collidable { Radius = 0.18f });
            em.AddComponent<BanditScoutTag>(entity);

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.95f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.20f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Hostile-faction Zombie (undead humanoid) at the given hex. Unarmed bite/claw melee with PreferUnits — the horde chases and eats people rather than bashing walls. Slower than Bandits but tougher per body; clusters spawn at night via ZombieNightSpawnSystem.</summary>
        public static Entity SpawnZombieAt(EntityManager em, int2 hex, uint rngSeed,
                                           UnitSpawnState state = default)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.Zombie);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,
                Weapon = WeaponType.None,
            });
            em.AddComponentData(entity, EquipmentLoadoutResolver.Resolve(UnitType.Zombie, out _, out _, out _, out _));

            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health { Value = hp, Max = maxHp });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Hostile });
            em.AddComponentData(entity, new Collidable { Radius = 0.20f });

            em.AddComponentData(entity, new MeleeAttack
            {
                Range         = 0.45f,
                Damage        = 4.0f,
                Cooldown      = 1.3f,
                TimeSinceShot = 0f,
                TargetMode    = MeleeTargetMode.PreferUnits,
            });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.85f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.3f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Hostile-faction Skeleton at the given hex. Resolves a variant-specific MDX kit (<c>skeleton</c> / <c>skeleton-guard</c> / <c>skeleton-wraith</c> / <c>skeleton-fungal</c> / <c>skeleton-desert</c>) so Plain skeletons spawn naked while Guard variants get a rusted helm + shield, Wraith carries a rune-staff, etc. Carries the standard <see cref="Equipment"/> + visual byte components so DamageJob's mitigation pipeline + the existing equip auto-swap pick the right armor / weapon. The <see cref="SkeletonVariant"/> material property drives the shader's variant branch (palette + accessory overlay).</summary>
        public static Entity SpawnSkeletonAt(EntityManager em, int2 hex, uint rngSeed,
                                             byte variant = SkeletonVariantValue.Plain,
                                             UnitSpawnState state = default)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.Skeleton);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            string refSlug = EquipmentLoadoutResolver.RefForSkeletonVariant(variant);
            var equipment = EquipmentLoadoutResolver.ResolveByRef(
                refSlug,
                out byte shieldByte,
                out byte weaponByte,
                out byte helmetByte,
                out byte armorByte);

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type   = UnitType.Skeleton,
                Weapon = weaponByte,
                Helmet = helmetByte,
                Shield = shieldByte,
                Armor  = armorByte,
            });
            em.AddComponentData(entity, equipment);

            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health { Value = hp, Max = maxHp });

            em.AddComponentData(entity, new UnitVisual        { Value = (float)UnitType.Skeleton });
            em.AddComponentData(entity, new SkeletonVariant   { Value = (float)variant });
            em.AddComponentData(entity, new UnitWeaponVisual  { Value = (float)weaponByte });
            em.AddComponentData(entity, new UnitShieldVisual  { Value = (float)shieldByte });
            em.AddComponentData(entity, new UnitArmorVisual   { Value = (float)armorByte });
            em.AddComponentData(entity, new UnitFacingVisual  { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual  { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Hostile });
            em.AddComponentData(entity, new Collidable { Radius = 0.20f });

            float meleeDamage   = variant == SkeletonVariantValue.Guard  ? 6.0f : 4.5f;
            float meleeCooldown = variant == SkeletonVariantValue.Wraith ? 1.5f : 1.2f;
            em.AddComponentData(entity, new MeleeAttack
            {
                Range         = 0.45f,
                Damage        = meleeDamage,
                Cooldown      = meleeCooldown,
                TimeSinceShot = 0f,
                TargetMode    = MeleeTargetMode.PreferUnits,
            });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.85f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.3f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn an aggressive beast (Wolf, future Bear, etc.) at the given hex. Beast faction, no carried weapon, no jobs/needs, but does carry MeleeAttack so it bites adjacent Player / Wildlife units. Wanders by default; reactive combat handled by MeleeAttackSystem.</summary>
        public static Entity SpawnBeastAt(EntityManager em, int2 hex, uint rngSeed, byte unitType,
                                          UnitSpawnState state = default)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(unitType);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = WeaponType.None });

            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health { Value = hp, Max = maxHp });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Beast });
            em.AddComponentData(entity, new Collidable { Radius = 0.20f });

            em.AddComponentData(entity, new MeleeAttack
            {
                Range         = 0.45f,
                Damage        = 4.0f,
                Cooldown      = 1.2f,
                TimeSinceShot = 0f,
                TargetMode    = MeleeTargetMode.PreferUnits,
            });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.85f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.3f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a craftsman-built Fishing Boat at the given hex. Player faction; carries a harpoon MeleeAttack that preferentially targets Whales + Beasts. Water-locking is deferred — v1 boats walk on land too and rely on the Dock spawning them on water-adjacent tiles.</summary>
        public static Entity SpawnFishingBoatAt(EntityManager em, int2 hex, uint rngSeed,
                                                byte faction = FactionType.Player)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.FishingBoat);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = WeaponType.None });

            float maxHp = def.MaxHealth;
            em.AddComponentData(entity, new Health { Value = maxHp, Max = maxHp });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitShieldVisual { Value = (float)ShieldType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = faction });
            em.AddComponentData(entity, new Collidable { Radius = 0.22f });
            em.AddComponent<FishingBoatTag>(entity);
            em.AddComponent<WaterLockedTag>(entity);

            em.AddComponentData(entity, new MeleeAttack
            {
                Range         = 0.6f,
                Damage        = 8.0f,
                Cooldown      = 1.5f,
                TimeSinceShot = 0f,
                TargetMode    = MeleeTargetMode.PreferUnits,
            });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.9f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.2f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Player-faction Galley warship at the given hex. Shipyard-built; carries a <see cref="RangedAttack"/> arrow loadout that auto-fires at hostile targets in range. Mirrors the FishingBoat shape (water-locked, hull rendered as a humanoid sprite slot) but swaps melee for ranged + bumps HP / damage.</summary>
        public static Entity SpawnGalleyAt(EntityManager em, int2 hex, uint rngSeed,
                                           byte faction = FactionType.Player)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.Galley);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = WeaponType.None });

            float maxHp = def.MaxHealth;
            em.AddComponentData(entity, new Health { Value = maxHp, Max = maxHp });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitShieldVisual { Value = (float)ShieldType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = faction });
            em.AddComponentData(entity, new Collidable { Radius = 0.24f });
            em.AddComponent<GalleyTag>(entity);
            em.AddComponent<WaterLockedTag>(entity);

            em.AddComponentData(entity, new RangedAttack
            {
                Range              = 4.0f,
                Damage             = 10f,
                Cooldown           = 1.6f,
                TimeSinceShot      = 0f,
                ProjectileType     = ProjectileType.Arrow,
                ProjectileMod      = ArrowMod.None,
                ProjectileSpeed    = 5.0f,
                ProjectileLifetime = 1.4f,
            });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.9f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.2f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Hostile-faction PirateShip raider at the given hex. PirateCove-spawned; carries a <see cref="RangedAttack"/> arrow loadout. Faster than the Player Galley but slightly less HP — leans on speed + numbers as a swarm threat.</summary>
        public static Entity SpawnPirateShipAt(EntityManager em, int2 hex, uint rngSeed)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.PirateShip);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = WeaponType.None });

            float maxHp = def.MaxHealth;
            em.AddComponentData(entity, new Health { Value = maxHp, Max = maxHp });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitShieldVisual { Value = (float)ShieldType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Hostile });
            em.AddComponentData(entity, new Collidable { Radius = 0.24f });
            em.AddComponent<PirateShipTag>(entity);
            em.AddComponent<WaterLockedTag>(entity);

            em.AddComponentData(entity, new RangedAttack
            {
                Range              = 3.6f,
                Damage             = 8f,
                Cooldown           = 1.4f,
                TimeSinceShot      = 0f,
                ProjectileType     = ProjectileType.Arrow,
                ProjectileMod      = ArrowMod.None,
                ProjectileSpeed    = 5.5f,
                ProjectileLifetime = 1.2f,
            });

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.9f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.2f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a Whale at the given water hex. Beast faction, passive — no attack components so it just wanders slowly until a FishingBoat harpoons it dead. Death drops Oil + 400 Meat via EnemyLootDropSystem.</summary>
        public static Entity SpawnWhaleAt(EntityManager em, int2 hex, uint rngSeed)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.Whale);
            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit { Type = def.UnitType, Weapon = WeaponType.None });

            float maxHp = def.MaxHealth;
            em.AddComponentData(entity, new Health { Value = maxHp, Max = maxHp });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Beast });
            em.AddComponentData(entity, new Collidable { Radius = 0.30f });
            em.AddComponent<WhaleTag>(entity);
            em.AddComponent<WaterLockedTag>(entity);

            em.AddComponentData(entity, new MovementModifier { SpeedMul = 1f });
            em.AddBuffer<StatusEffect>(entity);

            float speedJit = 0.9f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.2f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed * speedJit,
                Facing          = UnitFacing.East,
                RandomState     = rngSeed | 1u,
                WanderStep      = 0u,
                DwellTimer      = (rngSeed % 200u) / 200f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

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
            _heroMaterial = new Material(shader) { enableInstancing = true };
            _heroMaterial.SetColor("_KnightArmor",      new Color(0.96f, 0.82f, 0.28f, 1f));
            _heroMaterial.SetColor("_KnightArmorShade", new Color(0.64f, 0.48f, 0.10f, 1f));
            _heroMaterial.SetColor("_KnightPlume",      new Color(0.72f, 0.14f, 0.18f, 1f));
            _heroMaterialReady = true;

            _renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            _renderArray = new RenderMeshArray(new[] { _material, _heroMaterial }, new[] { _mesh });

            _renderAssetsReady = true;
            return true;
        }

        public static Entity SpawnHeroAt(EntityManager em, int2 hex, uint rngSeed, byte heroRole)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var entity = SpawnGoblinAt(em, hex, rngSeed, default, FactionType.Player, UnitType.Knight);
            if (entity == Entity.Null) return Entity.Null;

            ProfessionPriorities priorities = heroRole switch
            {
                HeroRole.MasterBlacksmith => ProfessionDefaults.HeroMasterBlacksmith(),
                HeroRole.MasterCraftsman  => ProfessionDefaults.HeroMasterCraftsman(),
                _                         => ProfessionDefaults.Get(UnitType.Knight),
            };
            em.SetComponentData(entity, priorities);
            em.AddComponentData(entity, new HeroTag { Role = heroRole });

            var (heroFirst, heroEpithet) = UnitNaming.GenerateHero(rngSeed, heroRole);
            em.SetComponentData(entity, new UnitName
            {
                FirstNameId = heroFirst,
                EpithetId   = heroEpithet,
            });

            if (_heroMaterialReady)
                em.SetComponentData(entity, MaterialMeshInfo.FromRenderMeshArrayIndices(1, 0));

            return entity;
        }

        static void AttachJobsIfPlayer(EntityManager em, Entity entity, byte faction, byte unitType, uint archetypeSeed = 0u)
        {
            if (faction != FactionType.Player) return;
            ProfessionPriorities priorities;
            if (unitType == UnitType.Goblin && archetypeSeed != 0u
                && !ProfessionPreferencesStore.HasOverride(unitType))
            {
                priorities = ProfessionDefaults.GoblinArchetype(archetypeSeed);
            }
            else
            {
                priorities = ProfessionPreferencesStore.GetOrDefault(unitType);
            }
            em.AddComponentData(entity, priorities);
            em.AddComponentData(entity, new ProfessionIntent
            {
                Kind         = ProfessionKind.None,
                TargetHex    = default,
                TargetEntity = Entity.Null,
            });
            em.AddBuffer<TaskMemory>(entity);
            em.AddComponentData(entity, new UnitBagStatus
            {
                FilledSlots = 0,
                Capacity    = (byte)InventoryUtil.BaseSlotCap,
            });
            em.AddComponentData(entity, new Skills());
            em.AddComponentData(entity, new SkillXP());

            em.AddComponentData(entity, new ActivityState { LastKind = ActivityKind.None });
        }

        static void AttachNeedsIfPlayer(EntityManager em, Entity entity, byte faction, NPCDef def, uint rngSeed = 0u)
        {
            if (faction != FactionType.Player) return;

            uint h1 = UnitHashOps.Spread(rngSeed);
            uint h2 = UnitHashOps.Spread(rngSeed ^ 0xDEADBEEFu);

            float hungerPct  = (h1 & 0xFFFFu) / 65535f * 0.45f;
            float fatiguePct = (h2 & 0xFFFFu) / 65535f * 0.45f;

            if (def.MaxHunger > 0f)
            {
                em.AddComponentData(entity, new Hunger
                {
                    Value     = def.MaxHunger * hungerPct,
                    Max       = def.MaxHunger,
                    PerSecond = def.HungerPerSec,
                });
            }
            if (def.MaxFatigue > 0f)
            {
                em.AddComponentData(entity, new Fatigue
                {
                    Value     = def.MaxFatigue * fatiguePct,
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

        static void AttachSpellsIfMagical(EntityManager em, Entity entity, byte unitType, byte faction)
        {
            if (faction != FactionType.Player) return;

            if (unitType == UnitType.Mage)
            {
                em.AddComponentData(entity, new SpellCast
                {
                    Range              = 5.0f,
                    Damage             = 12f,
                    Cooldown           = 2.5f,
                    TimeSinceCast      = 0f,
                    ManaCost           = 15f,
                    ProjectileType     = ProjectileType.Fireball,
                    ProjectileMod      = ArrowMod.Fire,
                    ProjectileSpeed    = 7f,
                    ProjectileLifetime = 1.5f,
                });
                em.AddComponentData(entity, new HealingAura
                {
                    Range         = 4f,
                    Amount        = 15f,
                    Period        = 2f,
                    TimeSinceHeal = 0f,
                    ManaCost      = 20f,
                });
                return;
            }

            if (unitType == UnitType.Goblin)
            {
                em.AddComponentData(entity, new SpellCast
                {
                    Range              = 3.5f,
                    Damage             = 4f,
                    Cooldown           = 8f,
                    TimeSinceCast      = 0f,
                    ManaCost           = 20f,
                    ProjectileType     = ProjectileType.IceShard,
                    ProjectileMod      = ArrowMod.Ice,
                    ProjectileSpeed    = 5f,
                    ProjectileLifetime = 1.2f,
                });
            }
        }

        static void AttachRangedAttackIfArmed(EntityManager em, Entity entity, byte weapon)
        {
            if (weapon == WeaponType.Crossbow)
            {
                em.AddComponentData(entity, new RangedAttack
                {
                    Range              = 3.0f,
                    Damage             = 9.0f,
                    Cooldown           = 1.5f,
                    TimeSinceShot      = 0f,
                    ProjectileType     = ProjectileType.Bolt,
                    ProjectileMod      = ArrowMod.None,
                    ProjectileSpeed    = 6.0f,
                    ProjectileLifetime = 2.5f,
                });
            }
        }

        static void AttachMeleeAttackIfArmed(EntityManager em, Entity entity, byte weapon, byte faction)
        {
            if (weapon != WeaponType.Club) return;

            byte mode = faction == FactionType.Hostile
                ? MeleeTargetMode.PreferBuildings
                : MeleeTargetMode.PreferUnits;

            em.AddComponentData(entity, new MeleeAttack
            {
                Range         = 0.45f,
                Damage        = 3.0f,
                Cooldown      = 1.0f,
                TimeSinceShot = 0f,
                TargetMode    = mode,
            });
        }

        static void AttachTraitsIfApplicable(EntityManager em, Entity entity, byte unitType, byte faction, uint rngSeed)
        {
            if (faction != FactionType.Player) return;
            if (unitType == UnitType.King) return;

            var traits = TraitDB.Roll(rngSeed);
            if (traits.T0 == TraitKind.None) return;

            em.AddComponentData(entity, traits);
            var mod = TraitDB.Accumulate(traits);

            if (em.HasComponent<Health>(entity) && mod.HealthBonus != 0f)
            {
                var h = em.GetComponentData<Health>(entity);
                h.Max   += mod.HealthBonus;
                h.Value  = math.min(h.Value + mod.HealthBonus, h.Max);
                em.SetComponentData(entity, h);
            }
            if (em.HasComponent<Energy>(entity) && mod.EnergyBonus != 0f)
            {
                var e = em.GetComponentData<Energy>(entity);
                e.Max   += mod.EnergyBonus;
                e.Value  = math.min(e.Value + mod.EnergyBonus, e.Max);
                em.SetComponentData(entity, e);
            }
            if (em.HasComponent<Mana>(entity) && mod.ManaBonus != 0f)
            {
                var m = em.GetComponentData<Mana>(entity);
                m.Max   += mod.ManaBonus;
                m.Value  = math.min(m.Value + mod.ManaBonus, m.Max);
                em.SetComponentData(entity, m);
            }
            if (em.HasComponent<Hunger>(entity) && (mod.HungerMaxBonus != 0f || mod.HungerPerSecMul != 0f))
            {
                var hu = em.GetComponentData<Hunger>(entity);
                hu.Max       = math.max(10f, hu.Max + mod.HungerMaxBonus);
                hu.PerSecond = math.max(0f, hu.PerSecond * (1f + mod.HungerPerSecMul));
                hu.Value     = math.min(hu.Value, hu.Max);
                em.SetComponentData(entity, hu);
            }
            if (em.HasComponent<Fatigue>(entity) && (mod.FatigueMaxBonus != 0f || mod.FatiguePerSecMul != 0f))
            {
                var ft = em.GetComponentData<Fatigue>(entity);
                ft.Max       = math.max(10f, ft.Max + mod.FatigueMaxBonus);
                ft.PerSecond = math.max(0f, ft.PerSecond * (1f + mod.FatiguePerSecMul));
                ft.Value     = math.min(ft.Value, ft.Max);
                em.SetComponentData(entity, ft);
            }
            if (em.HasComponent<HealthRegen>(entity) && mod.HealthRegenBonus != 0f)
            {
                var r = em.GetComponentData<HealthRegen>(entity);
                r.PerSecond += mod.HealthRegenBonus;
                em.SetComponentData(entity, r);
            }
            else if (mod.HealthRegenBonus != 0f)
            {
                em.AddComponentData(entity, new HealthRegen { PerSecond = mod.HealthRegenBonus });
            }
            if (em.HasComponent<EnergyRegen>(entity) && mod.EnergyRegenBonus != 0f)
            {
                var r = em.GetComponentData<EnergyRegen>(entity);
                r.PerSecond += mod.EnergyRegenBonus;
                em.SetComponentData(entity, r);
            }
            if (em.HasComponent<ManaRegen>(entity) && mod.ManaRegenBonus != 0f)
            {
                var r = em.GetComponentData<ManaRegen>(entity);
                r.PerSecond += mod.ManaRegenBonus;
                em.SetComponentData(entity, r);
            }
            if (em.HasComponent<UnitMovement>(entity) && mod.MoveSpeedBonus != 0f)
            {
                var m = em.GetComponentData<UnitMovement>(entity);
                m.MoveSpeed += mod.MoveSpeedBonus;
                em.SetComponentData(entity, m);
            }
            if (em.HasComponent<RangedAttack>(entity) && mod.RangedDamageBonus != 0f)
            {
                var r = em.GetComponentData<RangedAttack>(entity);
                r.Damage += mod.RangedDamageBonus;
                em.SetComponentData(entity, r);
            }
            if (em.HasComponent<MeleeAttack>(entity) && mod.MeleeDamageBonus != 0f)
            {
                var m = em.GetComponentData<MeleeAttack>(entity);
                m.Damage += mod.MeleeDamageBonus;
                em.SetComponentData(entity, m);
            }

            ApplyTraitProfessionBias(em, entity, traits);
            PublishTraitToast(traits, unitType);
        }

        static void PublishTraitToast(UnitTraits traits, byte unitType)
        {
            if (_suppressTraitToasts) return;
            if (unitType == UnitType.Goblin) return;
            if (traits.T0 == TraitKind.None) return;
            if (!IsNoteworthy(traits)) return;

            MessagePipe.IPublisher<ToastMessage> pub = null;
            try { pub = MessagePipe.GlobalMessagePipe.GetPublisher<ToastMessage>(); }
            catch { return; }
            if (pub == null) return;

            var sb = Cysharp.Text.ZString.CreateStringBuilder();
            try
            {
                sb.Append("Hero born: ");
                bool first = true;
                AppendTraitName(ref sb, traits.T0, ref first);
                AppendTraitName(ref sb, traits.T1, ref first);
                AppendTraitName(ref sb, traits.T2, ref first);
                var kind = HasFlaw(traits) ? ToastKind.Warning : ToastKind.Success;
                pub.Publish(new ToastMessage(sb.ToString(), kind));
            }
            finally { sb.Dispose(); }
        }

        static bool IsNoteworthy(UnitTraits t)
        {
            return SlotCount(t) >= 2 || HasHighlight(t);
        }

        static int SlotCount(UnitTraits t)
        {
            int n = 0;
            if (t.T0 != TraitKind.None) n++;
            if (t.T1 != TraitKind.None) n++;
            if (t.T2 != TraitKind.None) n++;
            return n;
        }

        static bool HasHighlight(UnitTraits t)
            => IsHighlight(t.T0) || IsHighlight(t.T1) || IsHighlight(t.T2);

        static bool IsHighlight(byte kind)
            => kind == TraitKind.Stalwart || kind == TraitKind.Scholar
            || kind == TraitKind.Keen     || kind == TraitKind.Strong
            || kind == TraitKind.Tough    || kind == TraitKind.Energetic;

        static bool HasFlaw(UnitTraits t)
            => TraitDB.IsFlaw(t.T0) || TraitDB.IsFlaw(t.T1) || TraitDB.IsFlaw(t.T2);

        static void AppendTraitName(ref Cysharp.Text.Utf16ValueStringBuilder sb, byte kind, ref bool first)
        {
            if (kind == TraitKind.None) return;
            if (!first) sb.Append(", ");
            sb.Append(TraitDisplayName(kind));
            first = false;
        }

        static string TraitDisplayName(byte kind) => kind switch
        {
            TraitKind.Tough       => "Tough",
            TraitKind.Swift       => "Swift",
            TraitKind.Ascetic     => "Ascetic",
            TraitKind.Restful     => "Restful",
            TraitKind.Energetic   => "Energetic",
            TraitKind.Scholar     => "Scholar",
            TraitKind.Keen        => "Keen Eye",
            TraitKind.Strong      => "Strong",
            TraitKind.Stalwart    => "Stalwart",
            TraitKind.Industrious => "Industrious",
            TraitKind.Frail       => "Frail",
            TraitKind.Sluggish    => "Sluggish",
            TraitKind.Glutton     => "Glutton",
            TraitKind.Insomniac   => "Insomniac",
            TraitKind.Timid       => "Timid",
            TraitKind.Sickly      => "Sickly",
            _                     => "",
        };

        static void ApplyTraitProfessionBias(EntityManager em, Entity entity, UnitTraits traits)
        {
            if (!em.HasComponent<ProfessionPriorities>(entity)) return;
            var p = em.GetComponentData<ProfessionPriorities>(entity);
            BumpPrioritiesFromTrait(ref p, traits.T0);
            BumpPrioritiesFromTrait(ref p, traits.T1);
            BumpPrioritiesFromTrait(ref p, traits.T2);
            em.SetComponentData(entity, p);
        }

        static void BumpPrioritiesFromTrait(ref ProfessionPriorities p, byte kind)
        {
            switch (kind)
            {
                case TraitKind.Tough:
                case TraitKind.Stalwart:
                case TraitKind.Strong:
                    p.Guard   = ClampBump(p.Guard,   +1);
                    p.Builder = ClampBump(p.Builder, +1);
                    break;
                case TraitKind.Keen:
                    p.Hunter = ClampBump(p.Hunter, +1);
                    p.Looter = ClampBump(p.Looter, +1);
                    break;
                case TraitKind.Scholar:
                    p.Craftsman = ClampBump(p.Craftsman, +1);
                    p.Medic     = ClampBump(p.Medic,     +1);
                    break;
                case TraitKind.Industrious:
                case TraitKind.Energetic:
                    p.Lumberjack = ClampBump(p.Lumberjack, +1);
                    p.Miner      = ClampBump(p.Miner,      +1);
                    break;
                case TraitKind.Swift:
                    p.Looter = ClampBump(p.Looter, +1);
                    break;
                case TraitKind.Glutton:
                    p.Chef = ClampBump(p.Chef, +1);
                    break;
                case TraitKind.Ascetic:
                    p.Hunter = ClampBump(p.Hunter, +1);
                    break;
                case TraitKind.Insomniac:
                    p.Guard = ClampBump(p.Guard, +1);
                    break;
                case TraitKind.Sluggish:
                    p.Builder = ClampBump(p.Builder, +1);
                    break;
                case TraitKind.Frail:
                case TraitKind.Sickly:
                    p.Guard = ClampBump(p.Guard, -1);
                    break;
                case TraitKind.Timid:
                    p.Guard = ClampBump(p.Guard, -2);
                    break;
            }
        }

        static byte ClampBump(byte current, int delta)
        {
            int next = current + delta;
            if (next < 0) next = 0;
            if (next > 5) next = 5;
            return (byte)next;
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

        bool IsLandHex(int2 hex)
        {
            if (!HexHoverSystem.TryGetHexEntity(hex, out var hexEntity)) return false;
            if (!EntityManager.HasComponent<BiomeType>(hexEntity)) return false;
            byte biome = EntityManager.GetComponentData<BiomeType>(hexEntity).Value;
            return biome != BiomeGenerator.BIOME_OCEAN && biome != BiomeGenerator.BIOME_RIVER;
        }

        int2 NearestLand(int2 hex)
        {
            if (IsLandHex(hex)) return hex;
            return FindNearestLandHex(hex);
        }

        int2 FindNearestLandHex(int2 origin)
        {
            if (IsLandHex(origin)) return origin;
            for (int radius = 1; radius <= 64; radius++)
            {
                for (int dx = -radius; dx <= radius; dx++)
                for (int dy = -radius; dy <= radius; dy++)
                {
                    if (math.abs(dx) != radius && math.abs(dy) != radius) continue;
                    int2 candidate = new int2(origin.x + dx, origin.y + dy);
                    if (IsLandHex(candidate)) return candidate;
                }
            }
            return origin;
        }
    }
}
