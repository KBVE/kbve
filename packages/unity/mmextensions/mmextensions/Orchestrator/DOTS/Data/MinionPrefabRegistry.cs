using UnityEngine;
using System.Collections.Generic;
using System.Linq;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// ScriptableObject that maps MinionType to Addressable addresses
    /// Create via KBVE > Database > Minion Prefab Registry menu
    /// </summary>
    public class MinionPrefabRegistry : ScriptableObject
    {
        [System.Serializable]
        public struct MinionPrefabEntry
        {
            [Tooltip("The type of minion this entry represents")]
            public MinionType minionType;

            [Tooltip("The Addressable address/key for this minion prefab (e.g., 'Minions/Zombie')")]
            public string addressableKey;

            [Tooltip("Optional label for grouping (e.g., 'enemy', 'boss')")]
            public string label;

            [Header("Override Stats (Optional)")]
            [Tooltip("Override default health for this specific prefab")]
            public float healthOverride;

            [Tooltip("Override default speed for this specific prefab")]
            public float speedOverride;

            [Tooltip("Override default damage for this specific prefab")]
            public float damageOverride;

            public bool HasHealthOverride => healthOverride > 0;
            public bool HasSpeedOverride => speedOverride > 0;
            public bool HasDamageOverride => damageOverride > 0;
        }

        [Header("Minion Prefab Mappings")]
        [SerializeField]
        private MinionPrefabEntry[] entries = new MinionPrefabEntry[]
        {
            new MinionPrefabEntry { minionType = MinionType.Basic, addressableKey = "Minions/Basic" },
            new MinionPrefabEntry { minionType = MinionType.Tank, addressableKey = "Minions/Zombie" }, // Zombie uses Tank type
            new MinionPrefabEntry { minionType = MinionType.Fast, addressableKey = "Minions/Fast" },
            new MinionPrefabEntry { minionType = MinionType.Ranged, addressableKey = "Minions/Ranged" },
            new MinionPrefabEntry { minionType = MinionType.Flying, addressableKey = "Minions/Flying" },
            new MinionPrefabEntry { minionType = MinionType.Boss, addressableKey = "Minions/Boss" }
        };

        [Header("Default Fallback")]
        [SerializeField]
        [Tooltip("Fallback address if a minion type is not found")]
        private string defaultFallbackAddress = "Minions/Basic";

        // Cache for quick lookups
        private Dictionary<MinionType, MinionPrefabEntry> _entryCache;

        private void OnEnable()
        {
            RebuildCache();
        }

        private void OnValidate()
        {
            RebuildCache();
        }

        private void RebuildCache()
        {
            _entryCache = new Dictionary<MinionType, MinionPrefabEntry>();
            foreach (var entry in entries)
            {
                if (!string.IsNullOrEmpty(entry.addressableKey))
                {
                    _entryCache[entry.minionType] = entry;
                }
            }
        }

        /// <summary>
        /// Get the Addressable address for a minion type
        /// </summary>
        public string GetAddressForType(MinionType type)
        {
            if (_entryCache == null)
                RebuildCache();

            if (_entryCache.TryGetValue(type, out var entry))
                return entry.addressableKey;

            Debug.LogWarning($"[MinionPrefabRegistry] No address found for MinionType.{type}, using fallback");
            return defaultFallbackAddress;
        }

        /// <summary>
        /// Get the full entry for a minion type
        /// </summary>
        public bool TryGetEntry(MinionType type, out MinionPrefabEntry entry)
        {
            if (_entryCache == null)
                RebuildCache();

            return _entryCache.TryGetValue(type, out entry);
        }

        /// <summary>
        /// Get all entries with a specific label
        /// </summary>
        public IEnumerable<MinionPrefabEntry> GetEntriesWithLabel(string label)
        {
            return entries.Where(e => e.label == label);
        }

        /// <summary>
        /// Check if a minion type has a prefab registered
        /// </summary>
        public bool HasPrefabForType(MinionType type)
        {
            if (_entryCache == null)
                RebuildCache();

            return _entryCache.ContainsKey(type);
        }

        /// <summary>
        /// Get all registered minion types
        /// </summary>
        public MinionType[] GetRegisteredTypes()
        {
            return _entryCache?.Keys.ToArray() ?? new MinionType[0];
        }
    }
}