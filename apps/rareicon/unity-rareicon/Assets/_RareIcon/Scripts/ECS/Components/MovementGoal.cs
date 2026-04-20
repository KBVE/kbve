using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Intent of a unit's movement — "why" it's walking, separate from
    /// "where to step next". Behavior systems (WanderBehaviorSystem,
    /// ReturnToBaseSystem, KingMoveCommandSystem, future hunt / flee
    /// / follow…) write this. PathfindingSystem reads it to plan each
    /// per-hex step. UnitMovementSystem only sees <see cref="UnitMovement.TargetHex"/>
    /// — it's pure locomotion and doesn't care about the goal.
    ///
    /// Layout is kept FFI-safe: byte constants + int2 + byte. No
    /// Entity references live in the component payload, which matters
    /// because a future Rust AI pass (uniti / bevy_behavior) may want
    /// to write goals across the FFI boundary with a memcpy. Enum
    /// values here must stay in sync with the repr(u8) Rust mirror.
    /// </summary>
    public struct MovementGoal : IComponentData
    {
        public byte Kind;       // GoalKind.* — maps to Rust u8 enum
        public byte Priority;   // GoalPriority.* — higher wins when two behaviors both want to set
        public int2 TargetHex;  // destination; meaning depends on Kind
    }

    /// <summary>
    /// Reasons a unit is moving. Values are stable byte IDs (not a C#
    /// enum) so they marshal cleanly to a Rust u8 enum and don't shift
    /// when new kinds slot in. Add new ones at the end.
    /// </summary>
    public static class GoalKind
    {
        public const byte None         = 0;  // no active goal — unit stays put
        public const byte MoveToHex    = 1;  // explicit player order (click-to-move)
        public const byte ReturnToBase = 2;  // head to the player's capital
        public const byte Wander       = 3;  // passive roam around a target hex
        public const byte Hunt         = 4;  // chase a hostile target (future)
        public const byte Flee         = 5;  // combat escape (future)
        public const byte Follow       = 6;  // stay near a friendly entity (future)
    }

    /// <summary>
    /// Priority bands behavior systems use to decide "can I overwrite
    /// this unit's existing goal?". Sparse so new behaviors slot in
    /// between without renumbering.
    ///
    /// Rule enforced by every behavior: only write a new goal when the
    /// existing goal's priority is strictly lower, or the existing goal
    /// is <see cref="GoalKind.None"/>. Behaviors are free to re-assert
    /// their own kind at the same priority (e.g. Wander updating its
    /// target hex on arrival) without violating this rule — same-kind
    /// re-writes always go through.
    /// </summary>
    public static class GoalPriority
    {
        public const byte None     = 0;
        public const byte Wander   = 10;
        public const byte Harvest  = 30;
        public const byte Return   = 50;
        public const byte Order    = 100; // player click-to-move
        public const byte Flee     = 200;
    }
}
