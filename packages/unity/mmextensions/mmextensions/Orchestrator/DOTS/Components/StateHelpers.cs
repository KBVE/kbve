using System.Runtime.CompilerServices;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>Inline helpers for state flag ops.</summary>
    public static class StateHelpers
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetMovementState(ref EntityState state, EntityStateFlags newMovement, float time)
        {
            state.flags = (state.flags & ~EntityStateFlags.MovementMask) | (newMovement & EntityStateFlags.MovementMask);
            state.lastStateChange = time;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static EntityStateFlags GetMovementState(in EntityState state) => state.flags & EntityStateFlags.MovementMask;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsPatrolling(in EntityState state) => (state.flags & EntityStateFlags.Patrolling) != 0;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool HasTarget(in EntityState state) => (state.flags & EntityStateFlags.HasTarget) != 0;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsInCombat(in EntityState state) => (state.flags & EntityStateFlags.InCombat) != 0;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void AddFlag(ref EntityState state, EntityStateFlags flag) => state.flags |= flag;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void RemoveFlag(ref EntityState state, EntityStateFlags flag) => state.flags &= ~flag;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool HasFlag(in EntityState state, EntityStateFlags flag) => (state.flags & flag) == flag;
    }
}
