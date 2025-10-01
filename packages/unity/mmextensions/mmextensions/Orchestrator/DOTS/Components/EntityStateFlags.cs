using System;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Bitwise state flags for all entities - replaces multiple boolean fields
    /// Uses 32-bit uint for up to 32 different states
    /// </summary>
    [Flags]
    public enum EntityStateFlags : uint
    {
        None = 0,

        // Movement states (bits 0-7) - mutually exclusive
        Idle = 1u << 0,
        Moving = 1u << 1,
        Patrolling = 1u << 2,
        Pursuing = 1u << 3,
        Retreating = 1u << 4,
        Orbiting = 1u << 5,
        Wandering = 1u << 6,
        Following = 1u << 7,

        // Combat states (bits 8-15) - can combine
        InCombat = 1u << 8,
        Attacking = 1u << 9,
        Defending = 1u << 10,
        Stunned = 1u << 11,
        Invulnerable = 1u << 12,

        // AI states (bits 16-23) - can combine
        HasTarget = 1u << 16,
        SearchingTarget = 1u << 17,
        TargetLost = 1u << 18,
        HasPath = 1u << 19,
        PathBlocked = 1u << 20,
        PathRecalculate = 1u << 21,

        // Group states (bits 24-31) - can combine
        InFormation = 1u << 24,
        IsLeader = 1u << 25,
        InHorde = 1u << 26,

        // Masks for efficient state group operations
        MovementMask = 0xFFu,          // Bits 0-7
        CombatMask = 0xFF00u,        // Bits 8-15
        AIMask = 0xFF0000u,       // Bits 16-23
        GroupMask = 0xFF000000u      // Bits 24-31
    }
}
