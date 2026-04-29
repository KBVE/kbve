using System;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Writes a MoveToHex <see cref="MovementGoal"/> on the <see cref="ControlledUnitTag"/> entity in response to <see cref="ControlledUnitMoveMessage"/>.</summary>
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
        }

        protected override void OnUpdate()
        {
            try
            {
                _sub = GlobalMessagePipe
                    .GetSubscriber<ControlledUnitMoveMessage>()
                    .Subscribe(OnMoveOrder);
                // Subscriber callback fires independently — kill OnUpdate so
                // the system stops getting ticked once we're wired in.
                Enabled = false;
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
