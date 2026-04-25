using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>In-memory accessor for mdx entries loaded from <c>StreamingAssets/itemdb.json</c>. Managed static cache; populated once at bootstrap by <see cref="ItemDBLoaderSystem"/> and read by UI / tooltip / lookup systems that need the full managed item record. <see cref="ItemDB"/> materialises the blittable Burst-safe slice from this cache.</summary>
    public static class ItemDBCache
    {
        static readonly Dictionary<string, ItemDBDef> _byRef = new();
        static readonly Dictionary<int, ItemDBDef> _byKey = new();

        public static bool IsLoaded { get; private set; }
        public static int Count => _byRef.Count;

        public static IReadOnlyDictionary<string, ItemDBDef> ByRef => _byRef;
        public static IReadOnlyDictionary<int, ItemDBDef> ByKey => _byKey;
        public static IEnumerable<ItemDBDef> All => _byRef.Values;

        public static void Load(IEnumerable<ItemDBDef> defs)
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

        public static bool TryGetByRef(string refSlug, out ItemDBDef def) => _byRef.TryGetValue(refSlug, out def);
        public static bool TryGetByKey(int key, out ItemDBDef def) => _byKey.TryGetValue(key, out def);

        public static void Clear()
        {
            _byRef.Clear();
            _byKey.Clear();
            IsLoaded = false;
        }
    }
}
