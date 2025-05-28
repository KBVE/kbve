using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using VContainer;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;
using MMHealth = MoreMountains.TopDownEngine.Health;


namespace KBVE.MMExtensions.Orchestrator.Health
{
    /// <summary>
    /// Extends MoreMountains' Health to support additional regenerating stats like mana, stamina, etc.
    /// </summary>
    public class ExtendedHealth : MMHealth, IStatTickable
    {
        /// <summary>
        /// Dictionary of stat entries (e.g., "mana", "stamina", etc.)
        /// </summary>
        public Dictionary<string, StatData> Stats = new();
        private string[] _cachedKeys = new string[0];

        /// <summary>
        /// Bitmask flags representing the entity's current stat states.
        /// </summary>
        public StatFlags CurrentFlags = StatFlags.None;

        private TickSystem _tickSystem;

        protected override void Start()
        {
            base.Start();
        
            AddStat("mana", new StatData(50, 100, 3f));
            AddStat("stamina", new StatData(100, 100, 5f));
            

            _tickSystem ??= TickLocator.Instance;

            if (_tickSystem != null)
            {
                _tickSystem.Register(this);
            }
            else
            {
                Debug.LogWarning("[ExtendedHealth] TickSystem not found — regeneration disabled.");
            }

        }

        private void OnDestroy()
        {
            _tickSystem?.Unregister(this);
        }

        /// <summary>
        /// Ticks stat regeneration each frame (driven by TickSystem).
        /// </summary>
        public void Tick(float deltaTime)
        {
            if (CurrentHealth <= 0) return;

            foreach (var key in _cachedKeys)
            {
                if (!CanRegenStat(key)) continue;

                if (Stats.TryGetValue(key, out var stat))
                {
                    stat.Regen(deltaTime);
                    Stats[key] = stat; // safe
                }
            }
        }


        /// <summary>Adds or updates a stat entry and refreshes the cached key list.</summary>
        public void AddStat(string stat, StatData data)
        {
            Stats[stat] = data;
            RefreshCachedKeys();
        }

        /// <summary>Removes a stat entry and refreshes the cached key list.</summary>
        public void RemoveStat(string stat)
        {
            if (Stats.Remove(stat))
                RefreshCachedKeys();
        }

        /// <summary>Refreshes the stat key cache used for tick-safe iteration.</summary>
        public void RefreshCachedKeys()
        {
            _cachedKeys = Stats.Keys.ToArray();
        }
        

        /// <summary>
        /// Returns whether a given stat can currently regenerate.
        /// </summary>
        public bool CanRegenStat(string stat)
        {
            if (CurrentFlags.HasFlag(StatFlags.Frozen)) return false;

            return stat switch
            {
                "mana" => !CurrentFlags.HasFlag(StatFlags.Silenced),
                "stamina" => !CurrentFlags.HasFlag(StatFlags.Exhausted),
                _ => true
            };
        }

        /// <summary>
        /// Adds or subtracts from a stat.
        /// </summary>
        public void ModifyStat(string stat, float amount)
        {
            if (!Stats.TryGetValue(stat, out var data)) return;
            data.Modify(amount);
            Stats[stat] = data;
        }

        /// <summary>
        /// Sets or removes stat flags.
        /// </summary>
        public void SetFlag(StatFlags flag, bool enable)
        {
            if (enable)
                CurrentFlags |= flag;
            else
                CurrentFlags &= ~flag;
        }

        /// <summary>
        /// Returns the current value of a stat.
        /// </summary>
        public float GetStatValue(string stat)
        {
            return Stats.TryGetValue(stat, out var data) ? data.Current : 0f;
        }
        
        [VContainer.Inject]
        public void InjectTickSystem(TickSystem system)
        {
            _tickSystem = system;
        }
    }
}
