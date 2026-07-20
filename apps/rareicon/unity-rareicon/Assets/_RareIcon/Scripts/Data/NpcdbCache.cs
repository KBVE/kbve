using System.Collections.Generic;
using KBVE.Proto.Npc;

namespace RareIcon
{
    /// <summary>In-memory accessor for <see cref="NpcRegistry"/> entries loaded from <c>StreamingAssets/npcdb.binpb</c>. Populated once at bootstrap by <see cref="NpcdbLoaderSystem"/>. Innkeeper spawn + future NPC consumers read from here. Holds Google.Protobuf-generated <see cref="Npc"/> messages directly so all proto fields stay accessible without bespoke POCOs.</summary>
    public static class NpcdbCache
    {
        static readonly Dictionary<string, Npc> _byRef = new();
        static readonly Dictionary<int, Npc>    _byUnitType = new();
        static readonly List<Npc> _innkeepers = new();
        static readonly List<Npc> _enemies    = new();
        static readonly List<Npc> _other      = new();

        public static bool IsLoaded { get; private set; }
        public static NpcRegistry Registry { get; private set; }

        public static IReadOnlyDictionary<string, Npc> ByRef      => _byRef;
        public static IReadOnlyDictionary<int, Npc>    ByUnitType => _byUnitType;
        public static IReadOnlyList<Npc>               Innkeepers => _innkeepers;
        public static IReadOnlyList<Npc>               Enemies    => _enemies;

        public static void Load(NpcRegistry registry)
        {
            Clear();
            Registry = registry;
            foreach (var n in registry.Npcs)
            {
                if (string.IsNullOrEmpty(n.Ref)) continue;
                _byRef[n.Ref] = n;

                if (n.HasUnitType && n.UnitType != 0) _byUnitType[n.UnitType] = n;

                int flags = (int)n.TypeFlags;
                if ((flags & (int)NpcTypeFlag.NpcTypeInnkeeper) != 0) _innkeepers.Add(n);
                else if ((flags & (int)NpcTypeFlag.NpcTypeEnemy)  != 0) _enemies.Add(n);
                else _other.Add(n);
            }
            IsLoaded = true;
        }

        public static bool TryGetByRef(string refSlug, out Npc n) =>
            _byRef.TryGetValue(refSlug, out n);

        public static bool TryGetByUnitType(int unitType, out Npc n) =>
            _byUnitType.TryGetValue(unitType, out n);

        public static void Clear()
        {
            Registry = null;
            _byRef.Clear();
            _byUnitType.Clear();
            _innkeepers.Clear();
            _enemies.Clear();
            _other.Clear();
            IsLoaded = false;
        }
    }
}
