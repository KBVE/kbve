using System.Collections.Generic;
using KBVE.Proto.Quest;

namespace RareIcon
{
    /// <summary>In-memory accessor for <see cref="QuestRegistry"/> entries loaded from <c>StreamingAssets/questdb.binpb</c>. Static managed cache; populated once at bootstrap by <see cref="QuestdbLoaderSystem"/>. Assigns sequential ushort IDs starting at <see cref="ProtoIdBase"/> so the proto-authored quests don't collide with the hardcoded tutorial range (QuestId.FoundingOrder = 1).</summary>
    public static class QuestdbCache
    {
        public const ushort ProtoIdBase = 1000;

        static readonly Dictionary<string, Quest> _byRef = new();
        static readonly Dictionary<ushort, Quest> _byId  = new();
        static readonly Dictionary<string, ushort> _refToId = new();

        public static bool IsLoaded { get; private set; }
        public static QuestRegistry Registry { get; private set; }

        public static IReadOnlyDictionary<string, Quest> ByRef => _byRef;
        public static IReadOnlyDictionary<ushort, Quest> ById  => _byId;

        public static void Load(QuestRegistry registry)
        {
            Clear();
            Registry = registry;
            ushort nextId = ProtoIdBase;
            foreach (var q in registry.Quests)
            {
                if (string.IsNullOrEmpty(q.Ref)) continue;
                ushort id = nextId++;
                _byRef[q.Ref]    = q;
                _byId[id]        = q;
                _refToId[q.Ref]  = id;
            }
            IsLoaded = true;
        }

        public static bool TryGetByRef(string refSlug, out Quest q) =>
            _byRef.TryGetValue(refSlug, out q);

        public static bool TryGetById(ushort id, out Quest q) =>
            _byId.TryGetValue(id, out q);

        public static bool TryGetIdByRef(string refSlug, out ushort id) =>
            _refToId.TryGetValue(refSlug, out id);

        public static void Clear()
        {
            Registry = null;
            _byRef.Clear();
            _byId.Clear();
            _refToId.Clear();
            IsLoaded = false;
        }

        public static uint FnvHash32(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0u;
            unchecked
            {
                uint h = 2166136261u;
                for (int i = 0; i < s.Length; i++)
                {
                    h ^= s[i];
                    h *= 16777619u;
                }
                return h;
            }
        }
    }
}
