using UnityEngine;
using MoreMountains.TopDownEngine;
using System.Collections.Generic;
using MMHealth = MoreMountains.TopDownEngine.Health;

// TODO: Merge this heal back into the extended health.

namespace KBVE.MMExtensions.Orchestrator.Health
{
    public static class HealthExtensions
    {
        public static void Heal(this MMHealth health, float amount, GameObject instigator = null)
        {
            if (amount <= 0 || health == null) return;

            // health.Damage(
            //     -amount,
            //     instigator ?? health.gameObject,
            //     0f,
            //     0f,
            //     Vector3.zero,
            //     null
            // );
            health.ReceiveHealth(amount, instigator ?? health.gameObject);

        }
    }
}