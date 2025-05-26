using UnityEngine;
using MoreMountains.TopDownEngine;
using KBVE.MMExtensions.Orchestrator.Interfaces;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    /// <summary>
    /// Extends MoreMountains' Health to support pooling via PrefabOrchestrator
    /// </summary>
    public class PooledHealth : Health
    {
        private string _poolKey;
        private IPrefabOrchestrator _orchestrator;

        /// <summary>
        /// Called by PrefabOrchestrator after spawning the object
        /// </summary>
        public void InitializePool(string poolKey, IPrefabOrchestrator orchestrator)
        {
            _poolKey = poolKey;
            _orchestrator = orchestrator;
        }

        public override void Kill()
        {
            base.Kill();

            if (!string.IsNullOrEmpty(_poolKey) && _orchestrator != null)
            {
                _orchestrator.Despawn(_poolKey, gameObject);
            }
            else
            {
                UnityEngine.Object.Destroy(gameObject); // fallback
            }
        }
    }
}
