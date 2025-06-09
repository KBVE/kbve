using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;
using MMHealth = MoreMountains.TopDownEngine.Health;
using MoreMountains.TopDownEngine;


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
        public Dictionary<StatType, StatData> Stats = new();
        private StatType[] _cachedKeys = Array.Empty<StatType>();

        /// <summary>
        /// Bitmask flags representing the entity's current stat states.
        /// </summary>
        public StatFlags CurrentFlags = StatFlags.None;

        private TickSystem _tickSystem;

        [Serializable]
        public struct StatPreset
        {
            public StatType type;
            public float baseValue;
            public float maxValue;
            public float regenRate;
        }

        [Header("Preset Stats (Base + Regen)")]
        [SerializeField]
        private List<StatPreset> _presetStats = new();
        public List<StatPreset> PresetStats => _presetStats;

        protected override void Start()
        {
            base.Start();

            RebuildStatsFromPresets();

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
        public void RebuildStatsFromPresets()
        {
            Stats.Clear();

            AddStat(StatType.Mana, new StatData(50, 100, 3f));
            AddStat(StatType.Energy, new StatData(100, 100, 5f));
            AddStat(StatType.Intelligence, new StatData(10, 10, 0f));
            AddStat(StatType.Stamina, new StatData(10, 10, 0f));
            AddStat(StatType.Armor, new StatData(5, 5, 0f));
            AddStat(StatType.Strength, new StatData(10, 10, 0f));

            foreach (var preset in _presetStats)
            {
                float baseVal = preset.baseValue > 0 ? preset.baseValue : StatHelper.GetDefaultBase(preset.type);
                float maxVal = preset.maxValue > 0 ? preset.maxValue : StatHelper.GetDefaultMax(preset.type);
                float regenVal = preset.regenRate >= 0 ? preset.regenRate : StatHelper.GetDefaultRegen(preset.type);

                ApplyPresetStat(preset.type, baseVal, maxVal, regenVal);
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
                    Stats[key] = stat; // re-assign to ensure struct is stored correctly
                }
            }
        }


        /// <summary>Adds or updates a stat entry and refreshes the cached key list.</summary>
        public void AddStat(StatType stat, StatData data)
        {
            Stats[stat] = data;
            RefreshCachedKeys();
        }
        /// <summary>Removes a stat entry and refreshes the cached key list.</summary>
        public void RemoveStat(StatType stat)
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
        public bool CanRegenStat(StatType stat)
        {
            if (CurrentFlags.HasFlag(StatFlags.Frozen)) return false;

            return stat switch
            {
                StatType.Mana => !CurrentFlags.HasFlag(StatFlags.Silenced),
                StatType.Stamina => !CurrentFlags.HasFlag(StatFlags.Exhausted),
                _ => true
            };
        }

        /// <summary>
        /// Adds or subtracts from a stat.
        /// </summary>
        public void ModifyStat(StatType stat, float amount)
        {
            if (!Stats.TryGetValue(stat, out var data))
            {
                Debug.LogWarning($"[ExtendedHealth] Attempted to modify stat '{stat}' which doesn't exist.");
                return;
            }

            data.Modify(amount);
            Stats[stat] = data;

            if (!_cachedKeys.Contains(stat))
                RefreshCachedKeys();
        }

        public void OverwriteStat(StatType stat, StatData newData)
        {
            Stats[stat] = newData;

            if (!_cachedKeys.Contains(stat))
                RefreshCachedKeys();
        }

        public void EnsureStat(StatType stat, StatData fallback)
        {
            if (!Stats.ContainsKey(stat))
            {
                Stats[stat] = fallback;
                RefreshCachedKeys();
            }
        }

        public void ApplyPresetStat(StatType stat, float baseBonus, float maxBonus, float regenBonus)
        {
            if (!Stats.TryGetValue(stat, out var data))
            {
                Debug.LogWarning($"[ExtendedHealth] Attempted to extend stat '{stat}' which doesn't exist.");
                return;
            }

            data.Base += baseBonus;
            data.Max += maxBonus;
            data.RegenRate += regenBonus;

            data.Clamp(); // Clamp current to new max


            Stats[stat] = data;

            if (!_cachedKeys.Contains(stat))
                RefreshCachedKeys();
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
        public float GetStatValue(StatType stat)
        {
            return Stats.TryGetValue(stat, out var data) ? data.Current : 0f;
        }

        /// <summary>
        /// Formulate the Damage with Armor
        /// </summary>
        public override float ComputeDamageOutput(float damage, List<TypedDamage> typedDamages = null, bool damageApplied = false)
        {
            if (Invulnerable || ImmuneToDamage)
                return 0;

            var armor = Stats.TryGetValue(StatType.Armor, out var data) ? data.Current : 0f;

            float reducedDamage = Mathf.Max(0f, damage - armor);
            return base.ComputeDamageOutput(reducedDamage, typedDamages, damageApplied);
        }



        [VContainer.Inject]
        public void InjectTickSystem(TickSystem system)
        {
            _tickSystem = system;
        }
    }
}
