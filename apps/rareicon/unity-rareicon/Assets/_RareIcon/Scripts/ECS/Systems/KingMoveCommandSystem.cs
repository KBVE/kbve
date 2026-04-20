using System;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Translates left-click hex selections into "King, walk there"
    /// orders by writing the King's <see cref="MovementGoal"/> at
    /// Order priority. PathfindingSystem then plans the per-hex steps
    /// and UnitMovementSystem does the smooth locomotion — the click
    /// handler stays purely in the Behavior layer of the
    /// Behavior → Pathfinding → Locomotion split.
    ///
    /// Order priority beats Wander (10) and ReturnToBase (50), so a
    /// click always wins over autopilot. It doesn't beat Flee (200) —
    /// the King shouldn't stand still and get arrow-pincushioned
    /// because the player misclicked.
    ///
    /// V1 caveats (acceptable, fix in pathfinding slice):
    /// - Pathfinder walks a straight-ish hex chain, no obstacle
    ///   awareness yet (walks over ocean tiles once we support them).
    /// - CurrentHex only updates on arrival, not per intermediate tile.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class KingMoveCommandSystem : SystemBase
    {
        IDisposable _sub;
        EntityQuery _kingQuery;

        protected override void OnCreate()
        {
            _kingQuery = GetEntityQuery(
                ComponentType.ReadWrite<MovementGoal>(),
                ComponentType.ReadOnly<KingTag>());

            // Defer subscription — DOTS systems boot before
            // RootLifetimeScope.Awake sets the GlobalMessagePipe provider.
            // Same pattern as DebugClickHarvestSystem.
        }

        protected override void OnUpdate()
        {
            if (_sub != null) return;
            try
            {
                _sub = GlobalMessagePipe
                    .GetSubscriber<HexClickedMessage>()
                    .Subscribe(OnHexClicked);
                Debug.Log("[KingMoveCommand] subscribed to HexClickedMessage — left-click to move the King");
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[KingMoveCommand] subscribe deferred: {ex.GetType().Name}");
            }
        }

        protected override void OnDestroy()
        {
            _sub?.Dispose();
            _sub = null;
        }

        void OnHexClicked(HexClickedMessage msg)
        {
            // Don't try to walk onto open ocean. (HexEnterModal still
            // opens for ocean clicks upstream; the move just no-ops.)
            if (!msg.IsLand) return;

            var kingArr = _kingQuery.ToEntityArray(Allocator.Temp);
            if (kingArr.Length == 0)
            {
                kingArr.Dispose();
                return; // King hasn't spawned yet (first frame race)
            }

            // Single King by design. Ghost-restore destroys the prior
            // before spawning a replacement, so duplicates shouldn't
            // exist — if they do, the first wins.
            var king = kingArr[0];
            EntityManager.SetComponentData(king, new MovementGoal
            {
                Kind      = GoalKind.MoveToHex,
                Priority  = GoalPriority.Order,
                TargetHex = new int2(msg.Q, msg.R),
            });

            kingArr.Dispose();
        }
    }
}
