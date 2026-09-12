using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Periodic re-roll of the Inn's quest board offers off the WorldClock turn delta. Iterates Tavern/Lodge entities (InnTag with BuildingTier ≥ 1), drops expired slots, and refills up to QuestBoardState.Capacity from QuestDBSingleton.Defs filtered by InnTierMin ≤ tier and matching giver hash. Off-main-thread parallel <see cref="QuestBoardRefreshJob"/> — each board's <see cref="QuestBoardState"/> + <see cref="QuestBoardSlot"/> buffer is per-entity, so the parallel walk is race-free without locks.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(QuestsDomainSystem))]
    public partial struct QuestBoardRefreshSystem : ISystem
    {
        const uint RefreshCadenceTurns = 8;

        EntityQuery _boardQuery;
        Random      _rng;

        public void OnCreate(ref SystemState state)
        {
            _boardQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<InnTag, BuildingTier, QuestBoardState, QuestBoardSlot>()
                .Build(ref state);
            _rng = new Random(0x71A2C9D3u);
            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate(_boardQuery);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            uint turn = clock.TurnIndex;

            if (!SystemAPI.HasSingleton<QuestDBSingleton>()) return;
            var db = SystemAPI.GetSingleton<QuestDBSingleton>();
            if (!db.Defs.IsCreated || db.Defs.Count == 0) return;

            uint baseSeed = _rng.NextUInt();
            if (baseSeed == 0u) baseSeed = 1u;

            state.Dependency = new QuestBoardRefreshJob
            {
                BaseSeed = baseSeed,
                Turn     = turn,
                Cadence  = RefreshCadenceTurns,
                Defs     = db.Defs,
                OwnedLU  = SystemAPI.GetComponentLookup<InnkeeperOwned>(true),
            }.ScheduleParallel(_boardQuery, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct QuestBoardRefreshJob : IJobEntity
    {
        public uint BaseSeed;
        public uint Turn;
        public uint Cadence;
        [ReadOnly] public NativeHashMap<ushort, QuestDefRuntime> Defs;
        [ReadOnly] public ComponentLookup<InnkeeperOwned> OwnedLU;

        void Execute(Entity entity,
                     [EntityIndexInQuery] int idx,
                     in BuildingTier tier,
                     ref QuestBoardState s,
                     DynamicBuffer<QuestBoardSlot> slots)
        {
            if (Turn < s.NextRefreshTurn) return;

            byte tierValue = tier.Value;
            uint giverHash = OwnedLU.HasComponent(entity) ? OwnedLU[entity].KeeperRefHash : 0u;

            for (int k = slots.Length - 1; k >= 0; k--)
                if (slots[k].ExpiresTurn != 0 && slots[k].ExpiresTurn <= Turn)
                    slots.RemoveAtSwapBack(k);

            int needed = s.Capacity - slots.Length;
            if (needed > 0)
            {
                var rng = new Random(BaseSeed ^ ((uint)idx * 0x9E3779B1u + 1u));
                FillSlots(slots, tierValue, giverHash, Turn, Cadence, needed, ref rng);
            }

            s.NextRefreshTurn = Turn + Cadence;
        }

        void FillSlots(DynamicBuffer<QuestBoardSlot> slots,
                       byte tier, uint giverHash, uint turn, uint cadence, int needed,
                       ref Random rng)
        {
            var pool = new NativeList<ushort>(Defs.Count, Allocator.Temp);
            using (var keys = Defs.GetKeyArray(Allocator.Temp))
            {
                for (int i = 0; i < keys.Length; i++)
                {
                    var def = Defs[keys[i]];
                    if (def.InnTierMin > tier) continue;
                    if (def.GiverNpcRefHash != 0u &&
                        giverHash != 0u &&
                        def.GiverNpcRefHash != giverHash) continue;
                    if (Contains(slots, def.Id)) continue;
                    pool.Add(def.Id);
                }
            }
            if (pool.Length == 0) { pool.Dispose(); return; }

            int picks = math.min(needed, pool.Length);
            for (int p = 0; p < picks; p++)
            {
                int idx = (int)(rng.NextUInt() % (uint)pool.Length);
                ushort qid = pool[idx];
                pool.RemoveAtSwapBack(idx);

                slots.Add(new QuestBoardSlot
                {
                    QuestId     = qid,
                    PostedTurn  = turn,
                    ExpiresTurn = turn + cadence * 2,
                    Tier        = tier,
                });
            }
            pool.Dispose();
        }

        static bool Contains(DynamicBuffer<QuestBoardSlot> slots, ushort qid)
        {
            for (int i = 0; i < slots.Length; i++)
                if (slots[i].QuestId == qid) return true;
            return false;
        }
    }
}
