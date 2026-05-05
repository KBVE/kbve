using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Reanimates dead Zombies as Skeletons. When a Zombie picks up <see cref="DeadTag"/> in <see cref="CleanupSystemGroup"/>, the rise chance rolls — on success a Plain Skeleton is spawned at the same hex before <see cref="DeathCleanupSystem"/> destroys the original entity. The roll is gated by night (only night Zombies rise; day kills decay normally) so daytime cleanup is not noisy. Spawning during cleanup is safe because <see cref="UnitSpawnSystem.SpawnSkeletonAt"/> creates a fresh entity outside the death entity's lifetime.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial class CorpseRiseSystem : SystemBase
    {
        const uint  RisePctNight = 35u;
        const uint  RisePctDay   = 8u;

        uint _rng = 0xCAFEF00Du & 0x7FFFFFFFu;

        protected override void OnCreate()
        {
            RequireForUpdate<DeadTag>();
            RequireForUpdate<WorldClock>();
        }

        protected override void OnUpdate()
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            uint risePct = clock.IsDay ? RisePctDay : RisePctNight;

            var risingHexes = new NativeList<int2>(8, Allocator.Temp);

            foreach (var (unit, movement, faction) in
                     SystemAPI.Query<RefRO<Unit>, RefRO<UnitMovement>, RefRO<Faction>>()
                              .WithAll<DeadTag>())
            {
                if (unit.ValueRO.Type != UnitType.Zombie) continue;
                if (faction.ValueRO.Value != FactionType.Hostile) continue;

                _rng = XorShift(_rng);
                if ((_rng % 100u) >= risePct) continue;

                risingHexes.Add(movement.ValueRO.CurrentHex);
            }

            var em = EntityManager;
            for (int i = 0; i < risingHexes.Length; i++)
            {
                _rng = XorShift(_rng);
                UnitSpawnSystem.SpawnSkeletonAt(em, risingHexes[i], _rng | 1u, SkeletonVariantValue.Plain);
            }
            risingHexes.Dispose();
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }
}
