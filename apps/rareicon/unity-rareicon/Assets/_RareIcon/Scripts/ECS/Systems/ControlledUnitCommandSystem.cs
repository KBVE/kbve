using System;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Translates left-click hex selections into a MoveToHex
    /// <see cref="MovementGoal"/> on whichever entity carries
    /// <see cref="ControlledUnitTag"/> — the player's currently
    /// driven unit. Defaults to the King; click-to-possess (Slice 3)
    /// migrates the tag onto whichever unit the player wants to drive.
    ///
    /// When no unit is controlled (god view), this system no-ops and
    /// the click falls through to the building inspector / build mode
    /// dispatch in <see cref="AppStateController"/>.
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
                    .GetSubscriber<HexClickedMessage>()
                    .Subscribe(OnHexClicked);
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

        void OnHexClicked(HexClickedMessage msg)
        {
            // Don't try to walk onto open ocean.
            if (!msg.IsLand) return;

            var arr = _controlledQuery.ToEntityArray(Allocator.Temp);
            if (arr.Length == 0)
            {
                arr.Dispose();
                return; // god view — no unit currently controlled
            }

            // ControlledUnitTag should only be on one entity; if there's
            // somehow more than one, the first wins. The click router
            // (Slice 3) will skip this system's effect when the click
            // hits a building or a possessable unit.
            var unit = arr[0];
            EntityManager.SetComponentData(unit, new MovementGoal
            {
                Kind      = GoalKind.MoveToHex,
                Priority  = GoalPriority.Order,
                TargetHex = new int2(msg.Q, msg.R),
            });

            arr.Dispose();
        }
    }
}
