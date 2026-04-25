using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Burst-safe runtime mirror of DietPreferencesStore. Overrides are packed as uint keys ((unitType &lt;&lt; 16) | itemId) → byte preference. Empty at boot; DietPreferencesStore.Set pushes into here too so UI writes stay in sync with Burst reads. Missing entries default to DietPreferencesStore.DefaultPreference (3).</summary>
    public struct DietPreferencesSingleton : IComponentData
    {
        public NativeHashMap<uint, byte> Overrides;

        public byte Get(byte unitType, ushort itemId)
        {
            uint key = ((uint)unitType << 16) | itemId;
            return Overrides.TryGetValue(key, out var v) ? v : DietPreferencesStore.DefaultPreference;
        }

        public static uint PackKey(byte unitType, ushort itemId)
            => ((uint)unitType << 16) | itemId;
    }
}
