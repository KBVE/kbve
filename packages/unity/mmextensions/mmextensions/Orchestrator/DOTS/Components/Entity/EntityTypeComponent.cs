using System;
using System.Runtime.InteropServices;
using Unity.Entities;
using Unity.Collections;
using Unity.Mathematics;
using ProtoBuf;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    // ================================
    // ENTITY TYPE AND ACTION ENUMS
    // ================================

    /// <summary>
    /// Bitwise flags for entity classification. Entities can have multiple types.
    /// Using uint for 32 possible flags.
    /// </summary>
    [Flags]
    public enum EntityType : uint
    {
        None = 0,

        // Core Types (0-7)
        Resource = 1 << 0,   // 1
        Structure = 1 << 1,   // 2
        Monster = 1 << 2,   // 4
        Unit = 1 << 3,   // 8
        Player = 1 << 4,   // 16
        NPC = 1 << 5,   // 32
        Projectile = 1 << 6,  // 64
        Item = 1 << 7,   // 128

        // Allegiance/Faction (8-11)
        Neutral = 1 << 8,   // 256
        Enemy = 1 << 9,   // 512
        Ally = 1 << 10,  // 1024
        Boss = 1 << 11,  // 2048

        // Properties (12-19)
        Interactable = 1 << 12, // 4096
        Destructible = 1 << 13, // 8192
        Collectible = 1 << 14, // 16384
        Tradeable = 1 << 15, // 32768
        Upgradeable = 1 << 16, // 65536
        Stackable = 1 << 17, // 131072
        Consumable = 1 << 18, // 262144
        Equippable = 1 << 19, // 524288

        // Special States (20-27)
        Elite = 1 << 20, // 1048576
        Rare = 1 << 21, // 2097152
        Epic = 1 << 22, // 4194304
        Legendary = 1 << 23, // 8388608
        Quest = 1 << 24, // 16777216
        Temporary = 1 << 25, // 33554432
        Persistent = 1 << 26, // 67108864
        Spawner = 1 << 27, // 134217728

        // Reserved for future (28-31)
        Reserved28 = 1 << 28,
        Reserved29 = 1 << 29,
        Reserved30 = 1 << 30,
        Reserved31 = 1u << 31, // Note: 1u for unsigned literal
    }

    /// <summary>
    /// Action state flags for what the entity is currently doing or can do.
    /// Using uint for 32 possible flags.
    /// </summary>
    [Flags]
    public enum EntityActionFlags : uint
    {
        None = 0,

        // Current State (0-9)
        Idle = 1 << 0,   // 1
        Moving = 1 << 1,   // 2
        Attacking = 1 << 2,   // 4
        Harvesting = 1 << 3,   // 8
        Building = 1 << 4,   // 16
        Producing = 1 << 5,   // 32
        Dead = 1 << 6,   // 64
        Damaged = 1 << 7,   // 128
        Healing = 1 << 8,   // 256
        Stunned = 1 << 9,   // 512

        // Status Effects (10-15)
        Invulnerable = 1 << 10,  // 1024
        Invisible = 1 << 11,  // 2048
        Burning = 1 << 12,  // 4096
        Frozen = 1 << 13,  // 8192
        Poisoned = 1 << 14,  // 16384
        Buffed = 1 << 15,  // 32768

        // Capabilities (16-23)
        CanAttack = 1 << 16,  // 65536
        CanMove = 1 << 17,  // 131072
        CanInteract = 1 << 18,  // 262144
        CanHarvest = 1 << 19,  // 524288
        CanBuild = 1 << 20,  // 1048576
        CanTrade = 1 << 21,  // 2097152
        CanCraft = 1 << 22,  // 4194304
        CanCast = 1 << 23,  // 8388608

        // AI/Behavior States (24-27)
        Aggressive = 1 << 24,  // 16777216
        Defensive = 1 << 25,  // 33554432
        Fleeing = 1 << 26,  // 67108864
        Patrolling = 1 << 27,  // 134217728

        // Reserved (28-31)
        Reserved28 = 1 << 28,
        Reserved29 = 1 << 29,
        Reserved30 = 1 << 30,
        Reserved31 = 1u << 31,
    }

    /// <summary>
    /// Component that identifies entity type and current action state.
    /// Total size: 8 bytes (4 + 4)
    /// </summary>
    public struct EntityTypeComponent : IComponentData
    {
        public EntityType Type;
        public EntityActionFlags ActionFlags;
    }

    /// <summary>
    /// Universal selected entity component - works with any entity type
    /// </summary>
    public struct SelectedEntity : IComponentData
    {
        public Unity.Entities.Entity Entity;
    }

    // ================================
    // PROTOBUF-NET ENTITY DATA
    // ================================

    /// <summary>
    /// Universal entity data using protobuf-net for serialization.
    /// Contains essential data present on all entities.
    /// Size: ~36 bytes
    /// </summary>
    [ProtoContract]
    public struct EntityData : IEntityData<EntityData>, IEquatable<EntityData>
    {
        /// <summary>Universal unique identifier for this entity</summary>
        [ProtoMember(1)]
        public FixedBytes16 Ulid;

        /// <summary>Entity type flags determining what this entity is</summary>
        [ProtoMember(2)]
        public EntityType Type;

        /// <summary>Action/state flags for what the entity is currently doing</summary>
        [ProtoMember(3)]
        public EntityActionFlags ActionFlags;

        /// <summary>World position of this entity</summary>
        [ProtoMember(4)]
        public float3 WorldPos;

        // ---- IEquatable Implementation ----
        public bool Equals(EntityData other)
        {
            return Ulid.Equals(other.Ulid)
                && Type == other.Type
                && ActionFlags == other.ActionFlags
                && WorldPos.Equals(other.WorldPos);
        }

        public override bool Equals(object obj) => obj is EntityData other && Equals(other);

        public override int GetHashCode()
        {
            unsafe
            {
                long h0, h1;
                fixed (FixedBytes16* p = &Ulid)
                {
                    h0 = ((long*)p)[0];
                    h1 = ((long*)p)[1];
                }

                unchecked
                {
                    int hash = (int)(h0 ^ (h0 >> 32)) * 16777619 ^ (int)(h1 ^ (h1 >> 32));
                    hash = (hash * 397) ^ (int)Type;
                    hash = (hash * 397) ^ (int)ActionFlags;
                    hash = (hash * 397) ^ (int)math.hash(WorldPos);
                    return hash;
                }
            }
        }

        public static bool operator ==(EntityData a, EntityData b) => a.Equals(b);
        public static bool operator !=(EntityData a, EntityData b) => !a.Equals(b);
    }

    // ================================
    // ECS COMPONENT WRAPPER
    // ================================

    /// <summary>
    /// ECS Component wrapper for EntityData.
    /// Provides implicit conversions for seamless integration.
    /// </summary>
    public struct EntityComponent : IComponentData
    {
        public EntityData Data;

        public EntityComponent(EntityData data) => Data = data;

        // Implicit conversions for ease of use
        public static implicit operator EntityData(EntityComponent component) => component.Data;
        public static implicit operator EntityComponent(EntityData data) => new EntityComponent(data);
    }

    // ================================
    // EXTENSION METHODS
    // ================================

    /// <summary>
    /// Extension methods for Entity ECS operations
    /// </summary>
    public static class EntityExtensions
    {
        /// <summary>Sets EntityData on an entity</summary>
        public static void SetEntityData(this EntityManager em, Unity.Entities.Entity entity, in EntityData data)
        {
            em.SetComponentData(entity, new EntityComponent(data));
        }

        /// <summary>Gets EntityData from an entity</summary>
        public static EntityData GetEntityData(this EntityManager em, Unity.Entities.Entity entity)
        {
            return em.GetComponentData<EntityComponent>(entity).Data;
        }

        /// <summary>Updates EntityData on an entity</summary>
        public static void UpdateEntityData(this EntityManager em, Unity.Entities.Entity entity, EntityData newData)
        {
            em.SetComponentData(entity, new EntityComponent(newData));
        }

        /// <summary>Checks if entity has EntityData component</summary>
        public static bool HasEntityData(this EntityManager em, Unity.Entities.Entity entity)
        {
            return em.HasComponent<EntityComponent>(entity);
        }

        // ---- Essential EntityTypeComponent modifier methods ----

        /// <summary>Adds entity type flags</summary>
        public static void AddType(ref this EntityTypeComponent comp, EntityType type)
        {
            comp.Type |= type;
        }

        /// <summary>Removes entity type flags</summary>
        public static void RemoveType(ref this EntityTypeComponent comp, EntityType type)
        {
            comp.Type &= ~type;
        }

        /// <summary>Adds action flags</summary>
        public static void AddActionFlag(ref this EntityTypeComponent comp, EntityActionFlags flag)
        {
            comp.ActionFlags |= flag;
        }

        /// <summary>Removes action flags</summary>
        public static void RemoveActionFlag(ref this EntityTypeComponent comp, EntityActionFlags flag)
        {
            comp.ActionFlags &= ~flag;
        }

        /// <summary>Sets action flag conditionally</summary>
        public static void SetActionFlag(ref this EntityTypeComponent comp, EntityActionFlags flag, bool value)
        {
            if (value)
                comp.ActionFlags |= flag;
            else
                comp.ActionFlags &= ~flag;
        }

        /// <summary>Checks if entity has specific type flags (all flags must match)</summary>
        public static bool HasType(this EntityTypeComponent comp, EntityType type)
        {
            return (comp.Type & type) == type;
        }

        /// <summary>Checks if entity has any of the specified type flags</summary>
        public static bool HasAnyType(this EntityTypeComponent comp, EntityType types)
        {
            return (comp.Type & types) != 0;
        }

        /// <summary>Checks if entity has specific action flags (all flags must match)</summary>
        public static bool HasActionFlag(this EntityTypeComponent comp, EntityActionFlags flag)
        {
            return (comp.ActionFlags & flag) == flag;
        }

        /// <summary>Checks if entity has any of the specified action flags</summary>
        public static bool HasAnyActionFlag(this EntityTypeComponent comp, EntityActionFlags flags)
        {
            return (comp.ActionFlags & flags) != 0;
        }
    }

    // ================================
    // SERIALIZATION HELPERS
    // ================================

    // ================================
    // ENTITY BLIT CONTAINER
    // ================================

    /// <summary>
    /// Burst-compatible container that holds EntityData + optional type-specific data.
    /// Uses flags and non-nullable fields for Burst compatibility.
    /// Updated to use new protobuf-powered data types.
    /// Implements IBufferElementData for use in DynamicBuffer caching systems.
    /// StructLayout.Sequential ensures predictable memory layout for unsafe operations.
    ///
    /// PERFORMANCE: EntityReference enables O(1) cache lookups via NativeHashMap<Entity, int>
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct EntityBlitContainer : IBufferElementData
    {
        // PERFORMANCE: Entity reference for O(1) cache index mapping
        public Unity.Entities.Entity EntityReference;

        public EntityData EntityData;   // Universal entity data

        // Non-nullable type-specific data (use HasX flags to check validity)
        public ResourceData Resource;   // Use HasResource to check if valid
        public StructureData Structure; // Use HasStructure to check if valid
        public CombatantData Combatant; // Use HasCombatant to check if valid
        public ItemData Item;           // Use HasItem to check if valid
        public PlayerData Player;       // Use HasPlayer to check if valid

        // Flags to indicate which data is valid (Burst-compatible)
        public bool HasResource;
        public bool HasStructure;
        public bool HasCombatant;
        public bool HasItem;
        public bool HasPlayer;

        /// <summary>Sets Resource data and marks it as valid</summary>
        public void SetResource(ResourceData resource)
        {
            Resource = resource;
            HasResource = true;
        }

        /// <summary>Sets Structure data and marks it as valid</summary>
        public void SetStructure(StructureData structure)
        {
            Structure = structure;
            HasStructure = true;
        }

        /// <summary>Sets Combatant data and marks it as valid</summary>
        public void SetCombatant(CombatantData combatant)
        {
            Combatant = combatant;
            HasCombatant = true;
        }

        /// <summary>Sets Item data and marks it as valid</summary>
        public void SetItem(ItemData item)
        {
            Item = item;
            HasItem = true;
        }

        /// <summary>Sets Player data and marks it as valid</summary>
        public void SetPlayer(PlayerData player)
        {
            Player = player;
            HasPlayer = true;
        }

        /// <summary>Clears all type-specific data</summary>
        public void Clear()
        {
            HasResource = false;
            HasStructure = false;
            HasCombatant = false;
            HasItem = false;
            HasPlayer = false;

            // Reset data to default values
            Resource = default;
            Structure = default;
            Combatant = default;
            Item = default;
            Player = default;
        }
    }

    // ================================
    // ENTITY TYPE PRESETS
    // ================================

    /// <summary>
    /// Common entity type combinations for convenience.
    /// These are NOT required, just helpful shortcuts.
    /// </summary>
    public static class EntityTypePresets
    {
        // === MONSTERS ===
        public static readonly EntityType BasicMonster =
            EntityType.Monster | EntityType.Enemy | EntityType.Destructible;

        public static readonly EntityType BossMonster =
            EntityType.Monster | EntityType.Enemy | EntityType.Boss | EntityType.Destructible;

        public static readonly EntityType LegendaryBoss =
            EntityType.Monster | EntityType.Enemy | EntityType.Boss | EntityType.Legendary | EntityType.Destructible;

        public static readonly EntityType EliteMob =
            EntityType.Monster | EntityType.Enemy | EntityType.Elite | EntityType.Destructible;

        // === RESOURCES ===
        public static readonly EntityType BasicResource =
            EntityType.Resource | EntityType.Interactable | EntityType.Neutral;

        public static readonly EntityType RareResource =
            EntityType.Resource | EntityType.Rare | EntityType.Interactable | EntityType.Destructible | EntityType.Neutral;

        public static readonly EntityType DepletableResource =
            EntityType.Resource | EntityType.Interactable | EntityType.Destructible | EntityType.Neutral | EntityType.Temporary;

        // === UNITS ===
        public static readonly EntityType PlayerUnit =
            EntityType.Unit | EntityType.Player | EntityType.Ally;

        public static readonly EntityType EnemyUnit =
            EntityType.Unit | EntityType.Enemy | EntityType.Destructible;

        public static readonly EntityType NeutralNPC =
            EntityType.Unit | EntityType.NPC | EntityType.Neutral | EntityType.Interactable;

        // === STRUCTURES ===
        public static readonly EntityType BasicStructure =
            EntityType.Structure | EntityType.Destructible;

        public static readonly EntityType PlayerStructure =
            EntityType.Structure | EntityType.Player | EntityType.Ally | EntityType.Destructible | EntityType.Upgradeable;

        public static readonly EntityType EnemyStructure =
            EntityType.Structure | EntityType.Enemy | EntityType.Destructible;

        // === ITEMS ===
        public static readonly EntityType QuestItem =
            EntityType.Item | EntityType.Quest | EntityType.Collectible;

        public static readonly EntityType ConsumableItem =
            EntityType.Item | EntityType.Consumable | EntityType.Collectible | EntityType.Stackable;

        public static readonly EntityType EquipmentItem =
            EntityType.Item | EntityType.Equippable | EntityType.Collectible | EntityType.Upgradeable;

        public static readonly EntityType LegendaryEquipment =
            EntityType.Item | EntityType.Equippable | EntityType.Legendary | EntityType.Collectible | EntityType.Upgradeable;
    }

    /// <summary>
    /// Common action flag combinations
    /// </summary>
    public static class EntityActionPresets
    {
        public static readonly EntityActionFlags IdleUnit =
            EntityActionFlags.Idle | EntityActionFlags.CanMove | EntityActionFlags.CanAttack;

        public static readonly EntityActionFlags AggressiveMonster =
            EntityActionFlags.Aggressive | EntityActionFlags.CanMove | EntityActionFlags.CanAttack;

        public static readonly EntityActionFlags HarvesterUnit =
            EntityActionFlags.Idle | EntityActionFlags.CanMove | EntityActionFlags.CanHarvest | EntityActionFlags.CanInteract;

        public static readonly EntityActionFlags BuilderUnit =
            EntityActionFlags.Idle | EntityActionFlags.CanMove | EntityActionFlags.CanBuild | EntityActionFlags.CanInteract;

        public static readonly EntityActionFlags DeadEntity =
            EntityActionFlags.Dead;

        public static readonly EntityActionFlags ProducingStructure =
            EntityActionFlags.Producing | EntityActionFlags.Idle;
    }

    // ================================
    // LEGACY COMPATIBILITY
    // ================================

    /// <summary>
    /// Legacy EntityBlit structure for backward compatibility
    /// </summary>
    public struct EntityBlit : IEquatable<EntityBlit>
    {
        public FixedBytes16 Ulid;
        public EntityType Type;
        public EntityActionFlags ActionFlags;
        public float3 WorldPos;

        // ---- Equality ----
        public bool Equals(EntityBlit other)
        {
            return Ulid.Equals(other.Ulid)
                && Type == other.Type
                && ActionFlags == other.ActionFlags
                && WorldPos.Equals(other.WorldPos);
        }

        public override bool Equals(object obj) => obj is EntityBlit o && Equals(o);

        public override int GetHashCode()
        {
            unsafe
            {
                long h0, h1;
                fixed (FixedBytes16* p = &Ulid)
                {
                    h0 = ((long*)p)[0];
                    h1 = ((long*)p)[1];
                }

                unchecked
                {
                    int hash = (int)(h0 ^ (h0 >> 32)) * 16777619 ^ (int)(h1 ^ (h1 >> 32));
                    hash = (hash * 397) ^ (int)Type;
                    hash = (hash * 397) ^ (int)ActionFlags;
                    hash = (hash * 397) ^ (int)math.hash(WorldPos);
                    return hash;
                }
            }
        }

        public static bool operator ==(EntityBlit a, EntityBlit b) => a.Equals(b);
        public static bool operator !=(EntityBlit a, EntityBlit b) => !a.Equals(b);

        // Implicit conversions to/from EntityData
        public static implicit operator EntityData(EntityBlit blit) => new EntityData
        {
            Ulid = blit.Ulid,
            Type = blit.Type,
            ActionFlags = blit.ActionFlags,
            WorldPos = blit.WorldPos
        };

        public static implicit operator EntityBlit(EntityData data) => new EntityBlit
        {
            Ulid = data.Ulid,
            Type = data.Type,
            ActionFlags = data.ActionFlags,
            WorldPos = data.WorldPos
        };
    }

    /// <summary>
    /// EntityBlit serialization helpers using protobuf-net
    /// </summary>
    public static class EntityBlitHelpers
    {
        /// <summary>Serialize EntityData to bytes using protobuf-net</summary>
        public static byte[] Serialize(EntityData data) => GenericBlit<EntityData>.Serialize(data);

        /// <summary>Deserialize bytes to EntityData using protobuf-net</summary>
        public static EntityData Deserialize(byte[] bytes) => GenericBlit<EntityData>.Deserialize(bytes);

        /// <summary>Serialize EntityBlit to bytes (converts to EntityData first)</summary>
        public static byte[] Serialize(EntityBlit blit) => Serialize((EntityData)blit);

        /// <summary>Deserialize bytes to EntityBlit (converts from EntityData)</summary>
        public static EntityBlit DeserializeToBlit(byte[] bytes) => (EntityBlit)Deserialize(bytes);
    }
}