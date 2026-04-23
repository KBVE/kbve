using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>In-memory accessor for mdx entries loaded from <c>StreamingAssets/mapdb.json</c>. Managed static cache; populated once at bootstrap by <see cref="MapdbLoaderSystem"/> and read by downstream registry systems. Keyed by the 32-bit FNV-1a hash of the mdx `ref` (see <see cref="MapdbRefs"/>); string refs are carried only for diagnostics.</summary>
    public static class MapdbCache
    {
        static readonly Dictionary<uint, MapdbDef> _byRefHash = new();
        static readonly Dictionary<string, MapdbDef> _byRef = new();
        static readonly List<MapdbDef> _buildings = new();
        static readonly List<MapdbDef> _resourceNodes = new();
        static readonly List<MapdbDef> _settlements = new();
        static readonly List<MapdbDef> _npcMarkers = new();
        static readonly List<MapdbDef> _landmarks = new();
        static readonly List<MapdbDef> _arenas = new();

        public static bool IsLoaded { get; private set; }

        public static IReadOnlyDictionary<uint, MapdbDef> ByRefHash => _byRefHash;
        public static IReadOnlyDictionary<string, MapdbDef> ByRef   => _byRef;

        public static IReadOnlyList<MapdbDef> Buildings      => _buildings;
        public static IReadOnlyList<MapdbDef> ResourceNodes  => _resourceNodes;
        public static IReadOnlyList<MapdbDef> Settlements    => _settlements;
        public static IReadOnlyList<MapdbDef> NpcMarkers     => _npcMarkers;
        public static IReadOnlyList<MapdbDef> Landmarks      => _landmarks;
        public static IReadOnlyList<MapdbDef> Arenas         => _arenas;

        public static void Load(IEnumerable<MapdbDef> defs)
        {
            Clear();
            foreach (var def in defs)
            {
                if (string.IsNullOrEmpty(def.Ref)) continue;
                _byRef[def.Ref] = def;
                _byRefHash[Fnv1a32(def.Ref)] = def;
                switch (def.Type)
                {
                    case "building":      _buildings.Add(def);     break;
                    case "resource_node": _resourceNodes.Add(def); break;
                    case "settlement":    _settlements.Add(def);   break;
                    case "npc_marker":    _npcMarkers.Add(def);    break;
                    case "landmark":      _landmarks.Add(def);     break;
                    case "arena":         _arenas.Add(def);        break;
                }
            }
            IsLoaded = true;
        }

        public static bool TryGetByHash(uint hash, out MapdbDef def) => _byRefHash.TryGetValue(hash, out def);
        public static bool TryGetByRef(string refSlug, out MapdbDef def) => _byRef.TryGetValue(refSlug, out def);

        public static void Clear()
        {
            _byRefHash.Clear();
            _byRef.Clear();
            _buildings.Clear();
            _resourceNodes.Clear();
            _settlements.Clear();
            _npcMarkers.Clear();
            _landmarks.Clear();
            _arenas.Clear();
            IsLoaded = false;
        }

        // Same FNV-1a 32-bit as gen-rareicon-mapdb.mjs. Constants live in
        // MapdbRefs.cs; this method exists for bootstrap lookups before that
        // codegen'd table is consulted.
        static uint Fnv1a32(string s)
        {
            uint hash = 0x811c9dc5u;
            for (int i = 0; i < s.Length; i++)
            {
                hash ^= s[i];
                hash *= 0x01000193u;
            }
            return hash;
        }
    }
}
