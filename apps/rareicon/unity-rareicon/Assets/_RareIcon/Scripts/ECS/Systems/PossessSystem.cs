using System;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Click-to-possess. Removes <see cref="ControlledUnitTag"/> from
    /// whichever entity currently carries it and adds it to the target
    /// emitted by the click router (<see cref="PossessUnitMessage"/>).
    /// At most one entity in the world should carry the tag at a time —
    /// this system enforces that invariant by clearing every existing
    /// holder before tagging the new one.
    ///
    /// Also clears any in-flight Order-priority MovementGoal on the
    /// previously-controlled unit so it doesn't keep walking toward the
    /// last click target after the player switched focus. The unit is
    /// then free to fall back to wander / job behavior next tick.
    /// </summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class PossessSystem : SystemBase
    {
        IDisposable _sub;

        protected override void OnCreate()
        {
            // Defer subscription — DOTS systems boot before
            // RootLifetimeScope.Awake sets the GlobalMessagePipe provider.
        }

        protected override void OnUpdate()
        {
            if (_sub != null) return;
            try
            {
                _sub = GlobalMessagePipe
                    .GetSubscriber<PossessUnitMessage>()
                    .Subscribe(OnPossess);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[PossessSystem] subscribe deferred: {ex.GetType().Name}");
            }
        }

        protected override void OnDestroy()
        {
            _sub?.Dispose();
            _sub = null;
        }

        void OnPossess(PossessUnitMessage msg)
        {
            var em = EntityManager;
            if (msg.Unit == Entity.Null || !em.Exists(msg.Unit)) return;

            // Strip the tag from any current holder(s). Should be 0..1 in
            // practice; the loop is defensive against drift.
            var holders = em.CreateEntityQuery(ComponentType.ReadOnly<ControlledUnitTag>());
            using (var arr = holders.ToEntityArray(Allocator.Temp))
            {
                for (int i = 0; i < arr.Length; i++)
                {
                    if (arr[i] == msg.Unit) continue;
                    em.RemoveComponent<ControlledUnitTag>(arr[i]);

                    // Cancel any explicit move order so the released unit
                    // doesn't keep marching toward the player's old click.
                    if (em.HasComponent<MovementGoal>(arr[i]))
                    {
                        var g = em.GetComponentData<MovementGoal>(arr[i]);
                        if (g.Priority == GoalPriority.Order)
                            em.SetComponentData(arr[i], default(MovementGoal));
                    }
                }
            }

            if (!em.HasComponent<ControlledUnitTag>(msg.Unit))
                em.AddComponent<ControlledUnitTag>(msg.Unit);
        }
    }
}
