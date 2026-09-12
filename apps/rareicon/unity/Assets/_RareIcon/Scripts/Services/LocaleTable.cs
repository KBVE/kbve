using Unity.Burst;
using Unity.Collections;

namespace RareIcon
{
    /// <summary>Burst-readable locale table. Populated by <see cref="LocaleService.LoadLocale"/> from the same JSON the managed dictionary reads, into a single <see cref="NativeHashMap{TKey,TValue}"/> with <see cref="FixedString64Bytes"/> keys and <see cref="FixedString512Bytes"/> values. Sized for the current 400-entry catalog with 4× headroom (capacity 1024); FS512 covers the longest current value (117 bytes) plus future growth. Storage is held in <see cref="SharedStatic{T}"/> so Burst-compiled <see cref="ISystem"/> callers see the same instance the managed service writes to. Mirrors the cross-world fast-path pattern used by <see cref="MultiplayerAuthority"/>.</summary>
    [BurstCompile]
    public static class LocaleTable
    {
        struct MapContext { }
        struct GenerationContext { }
        struct ReadyContext { }

        static readonly SharedStatic<NativeHashMap<FixedString64Bytes, FixedString512Bytes>> _map =
            SharedStatic<NativeHashMap<FixedString64Bytes, FixedString512Bytes>>.GetOrCreate<MapContext>();
        static readonly SharedStatic<int>  _generation = SharedStatic<int>.GetOrCreate<GenerationContext>();
        static readonly SharedStatic<bool> _isReady    = SharedStatic<bool>.GetOrCreate<ReadyContext>();

        /// <summary>Live native map. Storage owned by <see cref="LocaleService"/>; readers must NOT dispose. Empty (default) until <see cref="LocaleService.LoadLocale"/> runs the first time.</summary>
        public static ref NativeHashMap<FixedString64Bytes, FixedString512Bytes> Current => ref _map.Data;

        /// <summary>Bumped on every successful rebuild — Burst caches that snapshot a label can change-gate against this so they don't re-format every frame after a locale switch.</summary>
        public static ref int Generation => ref _generation.Data;

        /// <summary>True once the first locale has loaded; Burst readers gate on this so they don't poll an empty map.</summary>
        public static ref bool IsReady => ref _isReady.Data;

        /// <summary>Burst-safe key resolve. Returns <c>true</c> + writes the localized value when the key is present; falls back to <c>false</c> with <paramref name="value"/> set to the key itself so callers can render a visible diagnostic instead of an empty label.</summary>
        [BurstCompile]
        public static bool TryGet(in FixedString64Bytes key, out FixedString512Bytes value)
        {
            if (_isReady.Data && _map.Data.IsCreated && _map.Data.TryGetValue(key, out value))
                return true;
            value = default;
            value.Append(key);
            return false;
        }

        /// <summary>Managed-side convenience that wraps <see cref="TryGet"/> and returns the value (or the key as fallback). NOT [BurstCompile] — Burst external-call rules reject struct-by-value returns; Burst callers should use <see cref="TryGet"/> directly with the <c>out</c> parameter.</summary>
        public static FixedString512Bytes Get(in FixedString64Bytes key)
        {
            TryGet(key, out var v);
            return v;
        }
    }
}
