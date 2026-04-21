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
        const int   GoblinCount  = 15;
        const int   SpawnRadius  = 8;

        static Mesh                  _mesh;
        static Material              _material;
        static Material              _heroMaterial;
        static RenderMeshDescription _renderDesc;
        static RenderMeshArray       _renderArray;
        static bool                  _renderAssetsReady;
        static bool                  _heroMaterialReady;

        bool _spawned;

        protected override void OnUpdate()
        {
            if (_spawned) return;
            _spawned = true;

            if (!EnsureRenderAssets()) return;

            SpawnKingAt(EntityManager, new int2(0, 0));

            // Four garrison archers posted on the Capital's N/E/S/W footprint
            // hexes. Crossbow loadout, zero JobPriorities, never wander —
            // RangedAttackSystem auto-fires at any Hostile in 3 wu range
            // while they hold the perimeter.
            SpawnGarrisonGoblinAt(EntityManager, new int2( 1,  0), 0xA110C8u);
            SpawnGarrisonGoblinAt(EntityManager, new int2(-1,  0), 0xB22199u);
            SpawnGarrisonGoblinAt(EntityManager, new int2( 0,  1), 0xC332AAu);
            SpawnGarrisonGoblinAt(EntityManager, new int2( 0, -1), 0xD443BBu);

            SpawnHeroAt(EntityManager, new int2( 2,  0), 0x1001A1u, HeroRole.MasterBlacksmith);
            SpawnHeroAt(EntityManager, new int2(-2,  0), 0x1002B2u, HeroRole.MasterCraftsman);
            SpawnGoblinAt(EntityManager, new int2( 0,  2), 0x1003C3u, default, FactionType.Player, UnitType.Soldier);
            SpawnGoblinAt(EntityManager, new int2( 0, -2), 0x1004D4u, default, FactionType.Player, UnitType.Soldier);
            SpawnGoblinAt(EntityManager, new int2( 2, -2), 0x1005E5u, default, FactionType.Player, UnitType.Soldier);
            SpawnGoblinAt(EntityManager, new int2(-2,  2), 0x1006F6u, default, FactionType.Player, UnitType.Mage);

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
            AttachMeleeAttackIfArmed(em, entity, def.DefaultWeapon, faction);
            AttachNeedsIfPlayer(em, entity, faction, def);
            AttachJobsIfPlayer(em, entity, faction, def.UnitType, rngSeed);

            // Player goblins get individual names — drives the "Controlling: X"
            // indicator + RosterTab + future tooltips. Hostile / Beast goblins
            // stay nameless; the UI falls back to the creature.* locale label.
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
            var inv  = em.AddBuffer<InventorySlot>(entity);
            var pack = em.AddBuffer<PackSlot>(entity);
            if (state.Inv0Id != 0 && state.Inv0Qty > 0) { var uid = UlidFactory.NewUid(); inv.Add(new InventorySlot { Uid = uid, ItemId = state.Inv0Id, Count = state.Inv0Qty }); pack.Add(new PackSlot { Uid = uid, ItemId = state.Inv0Id, Count = state.Inv0Qty }); }
            if (state.Inv1Id != 0 && state.Inv1Qty > 0) { var uid = UlidFactory.NewUid(); inv.Add(new InventorySlot { Uid = uid, ItemId = state.Inv1Id, Count = state.Inv1Qty }); pack.Add(new PackSlot { Uid = uid, ItemId = state.Inv1Id, Count = state.Inv1Qty }); }
            if (state.Inv2Id != 0 && state.Inv2Qty > 0) { var uid = UlidFactory.NewUid(); inv.Add(new InventorySlot { Uid = uid, ItemId = state.Inv2Id, Count = state.Inv2Qty }); pack.Add(new PackSlot { Uid = uid, ItemId = state.Inv2Id, Count = state.Inv2Qty }); }
            if (state.Inv3Id != 0 && state.Inv3Qty > 0) { var uid = UlidFactory.NewUid(); inv.Add(new InventorySlot { Uid = uid, ItemId = state.Inv3Id, Count = state.Inv3Qty }); pack.Add(new PackSlot { Uid = uid, ItemId = state.Inv3Id, Count = state.Inv3Qty }); }

            em.AddComponent<UnitTestTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>Spawn a garrison archer (Crossbow goblin) posted at the given hex. Zero JobPriorities + GarrisonPost → never wanders, never harvests; RangedAttackSystem still auto-fires at hostiles in range.</summary>
        public static Entity SpawnGarrisonGoblinAt(EntityManager em, int2 hex, uint rngSeed)
        {
            // Spawn a Player goblin, then overwrite Weapon → Crossbow,
            // attach GarrisonPost, and zero the JobPriorities so the
            // jobs / relief / wander pipelines leave it on-tile.
            var entity = SpawnGoblinAt(em, hex, rngSeed, default, FactionType.Player);
            if (entity == Entity.Null) return Entity.Null;

            em.SetComponentData(entity, new Unit
            {
                Type   = UnitType.Goblin,
                Weapon = WeaponType.Crossbow,
            });
            AttachRangedAttackIfArmed(em, entity, WeaponType.Crossbow);

            em.AddComponentData(entity, new GarrisonPost { Hex = hex });
            em.SetComponentData(entity, new JobPriorities());

            var arrowUid = UlidFactory.NewUid();
            var inv  = em.GetBuffer<InventorySlot>(entity);
            var pack = em.GetBuffer<PackSlot>(entity);
            inv.Add(new InventorySlot { Uid = arrowUid, ItemId = (ushort)ItemId.Arrow, Count = ArcherRefillConfig.QuiverMax });
            pack.Add(new PackSlot     { Uid = arrowUid, ItemId = (ushort)ItemId.Arrow, Count = ArcherRefillConfig.QuiverMax });
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
                Helmet = HelmetType.Cap,
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
            AttachJobsIfPlayer(em, entity, FactionType.Player, def.UnitType);

            // King intentionally has no UnitName — the goblin name pool
            // doesn't fit, and the resolver falls back to the creature.king
            // locale label which already reads as "The King" in EN / "王様"
            // in JP. Future cosmetic-rename UI lands as a tagged override
            // component, not by squeezing the King into the goblin pool.

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
            var inv  = em.AddBuffer<InventorySlot>(entity);
            var pack = em.AddBuffer<PackSlot>(entity);
            if (state.Inv0Id != 0 && state.Inv0Qty > 0) { var uid = UlidFactory.NewUid(); inv.Add(new InventorySlot { Uid = uid, ItemId = state.Inv0Id, Count = state.Inv0Qty }); pack.Add(new PackSlot { Uid = uid, ItemId = state.Inv0Id, Count = state.Inv0Qty }); }
            if (state.Inv1Id != 0 && state.Inv1Qty > 0) { var uid = UlidFactory.NewUid(); inv.Add(new InventorySlot { Uid = uid, ItemId = state.Inv1Id, Count = state.Inv1Qty }); pack.Add(new PackSlot { Uid = uid, ItemId = state.Inv1Id, Count = state.Inv1Qty }); }
            if (state.Inv2Id != 0 && state.Inv2Qty > 0) { var uid = UlidFactory.NewUid(); inv.Add(new InventorySlot { Uid = uid, ItemId = state.Inv2Id, Count = state.Inv2Qty }); pack.Add(new PackSlot { Uid = uid, ItemId = state.Inv2Id, Count = state.Inv2Qty }); }
            if (state.Inv3Id != 0 && state.Inv3Qty > 0) { var uid = UlidFactory.NewUid(); inv.Add(new InventorySlot { Uid = uid, ItemId = state.Inv3Id, Count = state.Inv3Qty }); pack.Add(new PackSlot { Uid = uid, ItemId = state.Inv3Id, Count = state.Inv3Qty }); }

            // Founding charter — only seeded on the FRESH spawn (state has
            // no inventory). Ghost-restore preserves its own inventory and
            // a returning King shouldn't get a duplicate grant. Once the
            // Capital is placed the grant is consumed; future Royal Decree
            // / event items can re-grant the privilege.
            bool freshSpawn = state.Inv0Id == 0 && state.Inv1Id == 0
                           && state.Inv2Id == 0 && state.Inv3Id == 0;
            if (freshSpawn)
            {
                var charterUid = UlidFactory.NewUid();
                inv.Add(new InventorySlot  { Uid = charterUid, ItemId = (ushort)ItemId.CapitalLandGrant, Count = 1 });
                pack.Add(new PackSlot      { Uid = charterUid, ItemId = (ushort)ItemId.CapitalLandGrant, Count = 1 });
            }

            em.AddComponent<KingTag>(entity);
            // King defaults to player-controlled at game start so the
            // out-of-the-box UX is unchanged. Click-to-possess (slice 3)
            // moves ControlledUnitTag off the King onto a goblin.
            em.AddComponent<ControlledUnitTag>(entity);

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

            // Per-animal speed jitter — slower range than goblins so even
            // fast chickens stay slower than the slowest goblin.
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

            // No inventory buffer — HarvestSystem queries require it, so
            // animals are automatically skipped from resource pickup.
            // No RangedAttack / ReliefIntent / needs either: passive + mute.
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

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,
                Weapon = def.DefaultWeapon,
            });

            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health { Value = hp, Max = maxHp });
            if (def.MaxEnergy > 0)
                em.AddComponentData(entity, new Energy { Value = def.MaxEnergy, Max = def.MaxEnergy });

            em.AddComponentData(entity, new UnitVisual       { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual { Value = (float)def.DefaultWeapon });
            em.AddComponentData(entity, new UnitFacingVisual { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual { Value = 1f });

            em.AddComponentData(entity, new Faction    { Value = FactionType.Hostile });
            em.AddComponentData(entity, new Collidable { Radius = 0.20f });

            // Bandits hit harder than goblins and prefer buildings so a
            // raid actually pressures the empire's structures.
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

            // No inventory — death drops via EnemyLootDropSystem instead.

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

            // Bite is a no-weapon-prop melee. Slightly slower cooldown
            // than a Club so wolves feel like a hazard the player can
            // outrun rather than an instant TPK.
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

            // No PassiveAnimalTag — wolves don't flee, they engage.
            // No inventory — wolves don't loot or carry, they drop on death.
            // No JobPriorities / Needs — Beast faction is excluded from those systems.

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

            JobPriorities priorities = heroRole switch
            {
                HeroRole.MasterBlacksmith => JobDefaults.HeroMasterBlacksmith(),
                HeroRole.MasterCraftsman  => JobDefaults.HeroMasterCraftsman(),
                _                         => JobDefaults.Get(UnitType.Knight),
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
            JobPriorities priorities;
            if (unitType == UnitType.Goblin && archetypeSeed != 0u
                && !JobPreferencesStore.HasOverride(unitType))
            {
                priorities = JobDefaults.GoblinArchetype(archetypeSeed);
            }
            else
            {
                priorities = JobPreferencesStore.GetOrDefault(unitType);
            }
            em.AddComponentData(entity, priorities);
            em.AddComponentData(entity, new JobIntent
            {
                Kind         = JobKind.None,
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

            // Sticky per-entity record of the last activity the writer
            // emitted for this unit. Initialised to None so the very
            // first classification (whatever ReliefSystem / JobSystem
            // pick on tick 1) registers as a delta and surfaces to UI.
            em.AddComponentData(entity, new ActivityState { LastKind = ActivityKind.None });
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

        // Player-faction goblins use clubs for self-defence (PreferUnits —
        // don't wander off to smack your own storehouses when a hostile is
        // right there). Hostile-faction clubs bias toward PreferBuildings
        // so raids actually feel like raids, with defenders running
        // interference. Tune TargetMode per creature once we add more
        // hostile archetypes (sapper = BuildingsOnly, raider = Closest, etc).
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
