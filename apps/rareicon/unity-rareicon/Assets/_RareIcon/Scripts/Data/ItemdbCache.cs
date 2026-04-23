using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>In-memory accessor for mdx entries loaded from <c>StreamingAssets/itemdb.json</c>. Managed static cache; populated once at bootstrap by <see cref="ItemdbLoaderSystem"/> and read by UI / tooltip / lookup systems that need the full managed item record. <see cref="ItemDB"/> materialises the blittable Burst-safe slice from this cache.</summary>
    public static class ItemdbCache
    {
        static readonly Dictionary<string, ItemdbDef> _byRef = new();
        static readonly Dictionary<int, ItemdbDef> _byKey = new();

        public static bool IsLoaded { get; private set; }
        public static int Count => _byRef.Count;

        public static IReadOnlyDictionary<string, ItemdbDef> ByRef => _byRef;
        public static IReadOnlyDictionary<int, ItemdbDef> ByKey => _byKey;
        public static IEnumerable<ItemdbDef> All => _byRef.Values;

        public static void Load(IEnumerable<ItemdbDef> defs)
        {
            Clear();
            foreach (var def in defs)
            {
                if (string.IsNullOrEmpty(def.Ref)) continue;
                _byRef[def.Ref] = def;
                _byKey[def.Key] = def;
            }
            IsLoaded = true;
        }

        public static bool TryGetByRef(string refSlug, out ItemdbDef def) => _byRef.TryGetValue(refSlug, out def);
        public static bool TryGetByKey(int key, out ItemdbDef def) => _byKey.TryGetValue(key, out def);

        public static void Clear()
        {
            _byRef.Clear();
            _byKey.Clear();
            IsLoaded = false;
        }
    }
}
