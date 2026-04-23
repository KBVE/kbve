using System.Collections.Generic;
using KBVE.Proto.Map;

namespace RareIcon
{
    /// <summary>In-memory accessor for <see cref="MapRegistry"/> entries loaded from <c>StreamingAssets/mapdb.binpb</c>. Static managed cache; populated once at bootstrap by <see cref="MapdbLoaderSystem"/> and read by downstream registry systems. Holds Google.Protobuf–generated messages directly — no bespoke POCOs.</summary>
    public static class MapdbCache
    {
        static readonly Dictionary<string, WorldObjectDef> _byRef = new();
        static readonly List<WorldObjectDef> _buildings = new();
        static readonly List<WorldObjectDef> _resourceNodes = new();
        static readonly List<WorldObjectDef> _settlements = new();
        static readonly List<WorldObjectDef> _npcMarkers = new();
        static readonly List<WorldObjectDef> _landmarks = new();
        static readonly List<WorldObjectDef> _arenas = new();
        static readonly List<WorldObjectDef> _other = new();

        public static bool IsLoaded { get; private set; }
        public static MapRegistry Registry { get; private set; }

        public static IReadOnlyDictionary<string, WorldObjectDef> ByRef => _byRef;

        public static IReadOnlyList<WorldObjectDef> Buildings     => _buildings;
        public static IReadOnlyList<WorldObjectDef> ResourceNodes => _resourceNodes;
        public static IReadOnlyList<WorldObjectDef> Settlements   => _settlements;
        public static IReadOnlyList<WorldObjectDef> NpcMarkers    => _npcMarkers;
        public static IReadOnlyList<WorldObjectDef> Landmarks     => _landmarks;
        public static IReadOnlyList<WorldObjectDef> Arenas        => _arenas;

        public static void Load(MapRegistry registry)
        {
            Clear();
            Registry = registry;
            foreach (var def in registry.ObjectDefs)
            {
                if (string.IsNullOrEmpty(def.Ref)) continue;
                _byRef[def.Ref] = def;
                switch (def.Type)
                {
                    case WorldObjectType.WorldObjectBuilding:     _buildings.Add(def);     break;
                    case WorldObjectType.WorldObjectResourceNode: _resourceNodes.Add(def); break;
                    case WorldObjectType.WorldObjectSettlement:   _settlements.Add(def);   break;
                    case WorldObjectType.WorldObjectNpcMarker:    _npcMarkers.Add(def);    break;
                    case WorldObjectType.WorldObjectLandmark:     _landmarks.Add(def);     break;
                    case WorldObjectType.WorldObjectArena:        _arenas.Add(def);        break;
                    default:                                      _other.Add(def);         break;
                }
            }
            IsLoaded = true;
        }

        public static bool TryGetByRef(string refSlug, out WorldObjectDef def) =>
            _byRef.TryGetValue(refSlug, out def);

        public static void Clear()
        {
            Registry = null;
            _byRef.Clear();
            _buildings.Clear();
            _resourceNodes.Clear();
            _settlements.Clear();
            _npcMarkers.Clear();
            _landmarks.Clear();
            _arenas.Clear();
            _other.Clear();
            IsLoaded = false;
        }
    }
}
