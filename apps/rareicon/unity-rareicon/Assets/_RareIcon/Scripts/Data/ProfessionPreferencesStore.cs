using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>Runtime override store for per-UnitType job priorities; UnitSpawnSystem consults this before falling back to JobDefaults, and UICitizensPanel writes here on Apply.</summary>
    // TODO(rust-ffi): persist overrides per save so player tuning survives restarts; mirror in uniti.
    public static class JobPreferencesStore
    {
        static readonly Dictionary<byte, JobPriorities> _overrides = new();

        public static JobPriorities GetOrDefault(byte unitType)
            => _overrides.TryGetValue(unitType, out var p) ? p : JobDefaults.Get(unitType);

        public static bool HasOverride(byte unitType) => _overrides.ContainsKey(unitType);

        public static void Set(byte unitType, JobPriorities p) => _overrides[unitType] = p;

        public static void Clear(byte unitType) => _overrides.Remove(unitType);
    }
}
