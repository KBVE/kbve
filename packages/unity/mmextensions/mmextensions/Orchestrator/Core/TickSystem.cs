using System.Collections.Generic;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using VContainer.Unity;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    /// <summary>
    /// Central stat tick driver that updates all registered IStatTickable components at a fixed timestep.
    /// Driven by VContainer through IFixedTickable.
    /// </summary>
    public class TickSystem : IFixedTickable
    {
        private readonly List<IStatTickable> _tickables = new(256);

        /// <summary>
        /// Registers a component for ticking.
        /// </summary>
        public void Register(IStatTickable tickable)
        {
            if (!_tickables.Contains(tickable))
            {
                _tickables.Add(tickable);
            }
        }

        /// <summary>
        /// Unregisters a component from ticking.
        /// </summary>
        public void Unregister(IStatTickable tickable)
        {
            _tickables.Remove(tickable);
        }

        /// <summary>
        /// Called by VContainer every FixedUpdate frame to tick all stat-bearing systems.
        /// </summary>
        public void FixedTick()
        {
            float deltaTime = Time.fixedDeltaTime;

            for (int i = 0; i < _tickables.Count; i++)
            {
                _tickables[i].Tick(deltaTime);
            }
        }
    }
}
