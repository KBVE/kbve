using System;
using Unity.Entities;
using Unity.Collections;
using Unity.Mathematics;
using ProtoBuf;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
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
    }

    // ================================
    // SERIALIZATION HELPERS
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