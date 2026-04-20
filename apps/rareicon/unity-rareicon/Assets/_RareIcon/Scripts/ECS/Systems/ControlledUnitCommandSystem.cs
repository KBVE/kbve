using System;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Writes a MoveToHex <see cref="MovementGoal"/> on whichever entity
    /// carries <see cref="ControlledUnitTag"/> — the player's currently
    /// driven unit — in response to a <see cref="ControlledUnitMoveMessage"/>
    /// from the click router. Defaults to the King; click-to-possess
    /// migrates the tag onto whichever unit the player wants to drive.
    ///
    /// Listens to the semantic move message (not the raw click) so the
    /// router in <see cref="AppStateController"/> stays the single
    /// source of truth for "what does this click MEAN" — possession and
    /// inspect clicks never spuriously dispatch a move order here.
    /// </summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class ControlledUnitCommandSystem : SystemBase
    {
        IDisposable _sub;
        EntityQuery _controlledQuery;

        protected override void OnCreate()
        {
            _controlledQuery = GetEntityQuery(
                ComponentType.ReadWrite<MovementGoal>(),
                ComponentType.ReadOnly<ControlledUnitTag>());

            // Defer subscription — DOTS systems boot before
            // RootLifetimeScope.Awake sets the GlobalMessagePipe provider.
        }

        protected override void OnUpdate()
        {
            if (_sub != null) return;
            try
            {
                _sub = GlobalMessagePipe
                    .GetSubscriber<ControlledUnitMoveMessage>()
                    .Subscribe(OnMoveOrder);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[ControlledUnitCommand] subscribe deferred: {ex.GetType().Name}");
            }
        }

        protected override void OnDestroy()
        {
            _sub?.Dispose();
            _sub = null;
        }

        void OnMoveOrder(ControlledUnitMoveMessage msg)
        {
            var arr = _controlledQuery.ToEntityArray(Allocator.Temp);
            if (arr.Length == 0)
            {
                arr.Dispose();
                return;
            }

            var unit = arr[0];
            arr.Dispose();

            if (EntityManager.HasComponent<ShelteredInside>(unit)) return;

            EntityManager.SetComponentData(unit, new MovementGoal
            {
                Kind      = GoalKind.MoveToHex,
                Priority  = GoalPriority.Order,
                TargetHex = new int2(msg.Q, msg.R),
            });
        }
    }
}
