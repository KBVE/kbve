using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drops UnitType-specific loot onto the hex when a Hostile / Beast unit dies. Sister to WildlifeLootDropSystem — gated on faction (and absence of PassiveAnimalTag) so passive animal drops don't double-fire here.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial class EnemyLootDropSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<DeadTag>();
        }

        protected override void OnUpdate()
        {
            var dropLookup = SystemAPI.GetBufferLookup<ItemDrop>(isReadOnly: false);

            foreach (var (movement, unit, faction, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>, RefRO<Unit>, RefRO<Faction>>()
                              .WithAll<DeadTag>()
                              .WithNone<PassiveAnimalTag>()
                              .WithEntityAccess())
            {
                byte f = faction.ValueRO.Value;
                if (f != FactionType.Hostile && f != FactionType.Beast) continue;

                if (!HexHoverSystem.TryGetHexEntity(movement.ValueRO.CurrentHex, out var hex)) continue;
                if (!dropLookup.HasBuffer(hex)) continue;

                var buf = dropLookup[hex];
                uint h = (uint)entity.Index * 0x9E3779B1u ^ (uint)entity.Version * 0x85EBCA77u;
                h ^= h >> 13; h *= 0xC2B2AE3Du; h ^= h >> 16;
                float r0 = ((h       ) & 0xFFFFu) / 65535f;
                float r1 = ((h >> 16 ) & 0xFFFFu) / 65535f;

                switch (unit.ValueRO.Type)
                {
                    case UnitType.Wolf:
                        // Pelt is the reliable drop, fang is the lucky bonus.
                        AddStack(buf, (ushort)ItemId.WolfPelt, 1);
                        if (r0 < 0.55f) AddStack(buf, (ushort)ItemId.WolfFang,
                            (ushort)(1 + (int)(r1 * 1.99f)));
                        break;
                    case UnitType.Bandit:
                        // 1-3 coins every time + ~35% chance to shed their
                        // hood for the Looter to grab.
                        AddStack(buf, (ushort)ItemId.BanditCoin,
                            (ushort)(1 + (int)(r0 * 2.99f)));
                        if (r1 < 0.35f) AddStack(buf, (ushort)ItemId.Hood, 1);
                        break;
                    case UnitType.Goblin:
                        // Hostile-faction goblins drop meat on death — the
                        // check at the top of the loop (f == Hostile/Beast)
                        // gates Player goblins out, so this branch only
                        // fires for raid-wave goblins.
                        AddStack(buf, (ushort)ItemId.Meat, 3);
                        break;
                }
            }
        }

        static void AddStack(DynamicBuffer<ItemDrop> buf, ushort id, ushort count)
        {
            if (count == 0) return;
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].ItemId == id)
                {
                    var s = buf[i];
                    s.Count = (ushort)math.min(ushort.MaxValue, s.Count + count);
                    buf[i] = s;
                    return;
                }
            }
            buf.Add(new ItemDrop { ItemId = id, Count = count });
        }
    }
}
