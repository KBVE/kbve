using System;
using MessagePipe;
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
            try
            {
                _sub = GlobalMessagePipe
                    .GetSubscriber<PossessUnitMessage>()
                    .Subscribe(OnPossess);
                // Subscriber callback fires independently — kill OnUpdate so
                // the system stops getting ticked once we're wired in.
                Enabled = false;
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
            CharacterOrchestrator.Possess(EntityManager, ControllerId.Local, msg.Unit);
        }
    }
}
