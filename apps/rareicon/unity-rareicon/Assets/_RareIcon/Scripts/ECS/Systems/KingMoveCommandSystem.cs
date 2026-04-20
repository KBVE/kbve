using System;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Translates left-click hex selections into a MoveToHex MovementGoal on the King.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
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
