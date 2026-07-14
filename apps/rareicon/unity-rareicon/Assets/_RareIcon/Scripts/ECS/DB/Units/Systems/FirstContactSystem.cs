using MessagePipe;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Throttled once-per-second scan that fires a <see cref="DialogueStartMessage"/> the first time each hostile/beast <see cref="UnitType"/> is seen. SystemBase because the publish path is managed (<see cref="GlobalMessagePipe"/>); the scan itself is tiny (~200 entities at most, most ticks short-circuit via the <see cref="EncounteredTypes"/> bitmask).</summary>

    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class FirstContactSystem : SystemBase
    {
        const float Interval = 1.0f;

        float _timer;

        protected override void OnCreate()
        {
            if (!SystemAPI.HasSingleton<EncounteredTypes>())
                EntityManager.CreateSingleton(new EncounteredTypes());
        }

        protected override void OnUpdate()
        {
            _timer += SystemAPI.Time.DeltaTime;
            if (_timer < Interval) return;
            _timer = 0f;

            var seen = SystemAPI.GetSingleton<EncounteredTypes>();
            var firstOf = new NativeHashMap<byte, Entity>(8, Allocator.Temp);

            foreach (var (unitRO, factionRO, entity) in
                     SystemAPI.Query<RefRO<Unit>, RefRO<Faction>>().WithEntityAccess())
            {
                byte f = factionRO.ValueRO.Value;
                if (f != FactionType.Hostile && f != FactionType.Beast) continue;

                byte t = unitRO.ValueRO.Type;
                if (seen.IsSet(t)) continue;
                if (firstOf.ContainsKey(t)) continue;
                firstOf.Add(t, entity);
            }

            if (firstOf.Count > 0)
            {
                var pub = GlobalMessagePipe.GetPublisher<DialogueStartMessage>();
                foreach (var kv in firstOf)
                {
                    byte type = kv.Key;
                    seen.Set(type);
                    ushort treeId = NPCDB.Get(type).DialogueTreeId;
                    if (treeId != DialogueTreeId.None)
                        pub.Publish(new DialogueStartMessage(treeId, kv.Value));
                }
                SystemAPI.SetSingleton(seen);
            }

            firstOf.Dispose();
        }
    }
}
