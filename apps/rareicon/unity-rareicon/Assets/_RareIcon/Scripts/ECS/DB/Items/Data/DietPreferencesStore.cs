using System.Collections.Generic;
using Unity.Collections;

namespace RareIcon
{
    /// <summary>Per-(UnitType, ItemId) diet preference overrides (byte 0..5 where 0 = never collect, 5 = top preference). Default falls back to DefaultPreference (3). Writes mirror into DietPreferencesSingleton's NativeHashMap so Burst HarvestJob reads stay in sync with UI edits.</summary>

    public static class DietPreferencesStore
    {
        public const byte DefaultPreference = 3;
        public const byte MaxPreference     = 5;

        static readonly Dictionary<(byte unitType, ushort itemId), byte> _overrides = new();
        static NativeHashMap<uint, byte> _nativeMirror;
        static bool _nativeMirrorBound;

        /// <summary>Called by ItemDBBootstrapSystem.OnUpdate with the NativeHashMap that backs DietPreferencesSingleton.Overrides. Set/Clear below then double-writes so Burst readers stay consistent with managed UI writes. Pass `default` on teardown to release the reference.</summary>
        public static void BindNativeMirror(NativeHashMap<uint, byte> mirror)
        {
            _nativeMirror = mirror;
            _nativeMirrorBound = mirror.IsCreated;
        }

        public static byte Get(byte unitType, ushort itemId)
            => _overrides.TryGetValue((unitType, itemId), out var v) ? v : DefaultPreference;

        public static void Set(byte unitType, ushort itemId, byte preference)
        {
            if (preference > MaxPreference) preference = MaxPreference;
            _overrides[(unitType, itemId)] = preference;
            if (_nativeMirrorBound && _nativeMirror.IsCreated)
                _nativeMirror[DietPreferencesSingleton.PackKey(unitType, itemId)] = preference;
        }

        public static void Clear(byte unitType, ushort itemId)
        {
            _overrides.Remove((unitType, itemId));
            if (_nativeMirrorBound && _nativeMirror.IsCreated)
                _nativeMirror.Remove(DietPreferencesSingleton.PackKey(unitType, itemId));
        }
    }
}
