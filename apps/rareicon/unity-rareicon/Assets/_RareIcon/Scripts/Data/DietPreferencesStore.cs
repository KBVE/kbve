using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>Per-(UnitType, ItemId) diet preference overrides (byte 0..5 where 0 = never collect, 5 = top preference). Default falls back to ItemDB.GetHarvestWeight mapped into 0..5.</summary>
    // TODO(rust-ffi): persist overrides per save so player tuning survives restarts.
    public static class DietPreferencesStore
    {
        public const byte DefaultPreference = 3;
        public const byte MaxPreference     = 5;

        static readonly Dictionary<(byte unitType, ushort itemId), byte> _overrides = new();

        /// <summary>Returns 0..5; 0 = skip this item entirely.</summary>
        public static byte Get(byte unitType, ushort itemId)
            => _overrides.TryGetValue((unitType, itemId), out var v) ? v : DefaultPreference;

        public static void Set(byte unitType, ushort itemId, byte preference)
        {
            if (preference > MaxPreference) preference = MaxPreference;
            _overrides[(unitType, itemId)] = preference;
        }

        public static void Clear(byte unitType, ushort itemId) => _overrides.Remove((unitType, itemId));
    }
}
