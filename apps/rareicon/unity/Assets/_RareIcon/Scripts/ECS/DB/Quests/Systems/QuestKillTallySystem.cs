using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Bumps the Player's <see cref="QuestKillTally"/> buffer by unit type whenever a <see cref="DeadTag"/> entity with a Hostile / Beast faction is seen. Runs in <see cref="CleanupSystemGroup"/> before <see cref="DeathCleanupSystem"/> so deaths are counted before the entity is removed. Adds a new tally row if the unit type hasn't been tracked yet.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial struct QuestKillTallySystem : ISystem
    {
        EntityQuery _deadQ;
        EntityQuery _playerQ;

        public void OnCreate(ref SystemState state)
        {
            _deadQ = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<DeadTag, Unit, Faction>()
                .Build(ref state);
            _playerQ = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<PlayerTag>()
                .Build(ref state);
            state.RequireForUpdate(_deadQ);
            state.RequireForUpdate(_playerQ);
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var players = _playerQ.ToEntityArray(Allocator.Temp);
            if (players.Length == 0) { players.Dispose(); return; }
            Entity player = players[0];
            players.Dispose();

            var tallyLookup = SystemAPI.GetBufferLookup<QuestKillTally>();
            if (!tallyLookup.HasBuffer(player)) return;
            var tally = tallyLookup[player];

            foreach (var (unit, faction) in
                     SystemAPI.Query<RefRO<Unit>, RefRO<Faction>>().WithAll<DeadTag>())
            {
                byte f = faction.ValueRO.Value;
                if (f != FactionType.Hostile && f != FactionType.Beast) continue;

                byte t = unit.ValueRO.Type;
                bool found = false;
                for (int i = 0; i < tally.Length; i++)
                {
                    if (tally[i].UnitType == t)
                    {
                        var e = tally[i];
                        e.Count++;
                        tally[i] = e;
                        found = true;
                        break;
                    }
                }
                if (!found)
                    tally.Add(new QuestKillTally { UnitType = t, Count = 1 });
            }
        }
    }
}
