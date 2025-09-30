using Unity.Entities;
using Unity.Mathematics;
using System;
using System.Runtime.CompilerServices;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Bitwise state flags for all entities - replaces multiple boolean fields
    /// Uses 32-bit uint for up to 32 different states
    /// </summary>
    [Flags]
    public enum EntityStateFlags : uint
    {
        None            = 0,

        // Movement states (bits 0-7) - mutually exclusive
        Idle            = 1u << 0,
        Moving          = 1u << 1,
        Patrolling      = 1u << 2,
        Pursuing        = 1u << 3,
        Retreating      = 1u << 4,
        Orbiting        = 1u << 5,
        Wandering       = 1u << 6,
        Following       = 1u << 7,

        // Combat states (bits 8-15) - can combine
        InCombat        = 1u << 8,
        Attacking       = 1u << 9,
        Defending       = 1u << 10,
        Stunned         = 1u << 11,
        Invulnerable    = 1u << 12,

        // AI states (bits 16-23) - can combine
        HasTarget       = 1u << 16,
        SearchingTarget = 1u << 17,
        TargetLost      = 1u << 18,
        HasPath         = 1u << 19,
        PathBlocked     = 1u << 20,
        PathRecalculate = 1u << 21,

        // Group states (bits 24-31) - can combine
        InFormation     = 1u << 24,
        IsLeader        = 1u << 25,
        InHorde         = 1u << 26,

        // Masks for efficient state group operations
        MovementMask    = 0xFFu,          // Bits 0-7
        CombatMask      = 0xFF00u,        // Bits 8-15
        AIMask          = 0xFF0000u,       // Bits 16-23
        GroupMask       = 0xFF000000u      // Bits 24-31
    }

    /// <summary>
    /// Single unified state component replacing multiple boolean fields
    /// </summary>
    public struct EntityState : IComponentData
    {
        public EntityStateFlags flags;
        public float lastStateChange;

        public static EntityState CreateDefault()
        {
            return new EntityState
            {
                flags = EntityStateFlags.Idle,
                lastStateChange = 0f
            };
        }
    }

    /// <summary>
    /// Core entity data - type, faction, and basic stats
    /// </summary>
    public struct EntityCore : IComponentData
    {
        public EntityType type;
        public FactionType faction;
        public float health;
        public float maxHealth;
        public float speed;
        public float baseSpeed;

        public static EntityCore CreateZombie(float health = 100f, float speed = 3f)
        {
            return new EntityCore
            {
                type = EntityType.Zombie,
                faction = FactionType.Enemy,
                health = health,
                maxHealth = health,
                speed = speed,
                baseSpeed = speed
            };
        }
    }

    /// <summary>
    /// Movement and destination data - optimized for 2D
    /// </summary>
    public struct Movement : IComponentData
    {
        public float3 destination;      // Still float3 for world position compatibility
        public float2 facingDirection;  // 2D direction
        public float2 velocity;          // 2D velocity
        public float stoppingDistance;
        public float arrivalThreshold;

        public static Movement CreateDefault(float stoppingDistance = 2f)
        {
            return new Movement
            {
                destination = float3.zero,
                facingDirection = new float2(1, 0),
                velocity = float2.zero,
                stoppingDistance = stoppingDistance,
                arrivalThreshold = stoppingDistance * stoppingDistance // Pre-squared for efficiency
            };
        }
    }

    /// <summary>
    /// Navigation and targeting data
    /// </summary>
    public struct NavigationData : IComponentData
    {
        public Entity targetEntity;
        public float3 lastKnownTargetPos;
        public float scanRadius;
        public float updateInterval;
        public float lastUpdate;
        public int waypointIndex;
        public int pathVersion;

        public static NavigationData CreateDefault(float scanRadius = 15f)
        {
            return new NavigationData
            {
                targetEntity = Entity.Null,
                lastKnownTargetPos = float3.zero,
                scanRadius = scanRadius,
                updateInterval = 1f,
                lastUpdate = 0f,
                waypointIndex = -1,
                pathVersion = 0
            };
        }
    }

    /// <summary>
    /// Avoidance and collision data - kept separate for performance
    /// </summary>
    public struct AvoidanceData : IComponentData
    {
        public float personalSpace;
        public float3 avoidanceVector;
        public float speedVariation;
        public float lastAvoidanceUpdate;

        public static AvoidanceData CreateDefault(float personalSpace = 2f)
        {
            return new AvoidanceData
            {
                personalSpace = personalSpace,
                avoidanceVector = float3.zero,
                speedVariation = 1f,
                lastAvoidanceUpdate = 0f
            };
        }
    }

    /// <summary>
    /// Entity type enumeration
    /// </summary>
    public enum EntityType : byte
    {
        None = 0,
        Player = 1,
        Zombie = 2,
        NPC = 3,
        Building = 4,
        Projectile = 5
    }

    /// <summary>
    /// Static helper methods for state management with aggressive inlining
    /// </summary>
    public static class StateHelpers
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetMovementState(ref EntityState state, EntityStateFlags newMovement, float time)
        {
            state.flags = (state.flags & ~EntityStateFlags.MovementMask) | (newMovement & EntityStateFlags.MovementMask);
            state.lastStateChange = time;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static EntityStateFlags GetMovementState(in EntityState state)
        {
            return state.flags & EntityStateFlags.MovementMask;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsPatrolling(in EntityState state)
        {
            return (state.flags & EntityStateFlags.Patrolling) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool HasTarget(in EntityState state)
        {
            return (state.flags & EntityStateFlags.HasTarget) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsInCombat(in EntityState state)
        {
            return (state.flags & EntityStateFlags.InCombat) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void AddFlag(ref EntityState state, EntityStateFlags flag)
        {
            state.flags |= flag;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void RemoveFlag(ref EntityState state, EntityStateFlags flag)
        {
            state.flags &= ~flag;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool HasFlag(in EntityState state, EntityStateFlags flag)
        {
            return (state.flags & flag) == flag;
        }
    }
}