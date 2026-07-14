using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>Runtime override store for per-UnitType job priorities; UnitSpawnSystem consults this before falling back to ProfessionDefaults, and UICitizensPanel writes here on Apply.</summary>

    public static class ProfessionPreferencesStore
    {
        static readonly Dictionary<byte, ProfessionPriorities> _overrides = new();

        public static ProfessionPriorities GetOrDefault(byte unitType)
            => _overrides.TryGetValue(unitType, out var p) ? p : ProfessionDefaults.Get(unitType);

        public static bool HasOverride(byte unitType) => _overrides.ContainsKey(unitType);

        public static void Set(byte unitType, ProfessionPriorities p) => _overrides[unitType] = p;

        public static void Clear(byte unitType) => _overrides.Remove(unitType);
    }
}
