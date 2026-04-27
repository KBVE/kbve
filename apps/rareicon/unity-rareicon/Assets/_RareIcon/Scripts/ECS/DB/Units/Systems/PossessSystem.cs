using System;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Click-to-possess: migrates <see cref="ControlledUnitTag"/> to the target from <see cref="PossessUnitMessage"/> and clears the previous holder's Order MovementGoal.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class PossessSystem : SystemBase
    {
        IDisposable _sub;

        protected override void OnCreate() { }

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

            var holders = em.CreateEntityQuery(ComponentType.ReadOnly<ControlledUnitTag>());
            using (var arr = holders.ToEntityArray(Allocator.Temp))
            {
                for (int i = 0; i < arr.Length; i++)
                {
                    if (arr[i] == msg.Unit) continue;
                    em.RemoveComponent<ControlledUnitTag>(arr[i]);

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
