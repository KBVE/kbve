using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Periodic re-roll of the Inn's quest board offers off the WorldClock turn delta. Iterates Tavern/Lodge entities (InnTag with BuildingTier ≥ 1), drops expired slots, and refills up to QuestBoardState.Capacity from QuestDBSingleton.Defs filtered by InnTierMin ≤ tier and Category == Guild (when populated). Idempotent across the same turn — only fires when WorldClock.TurnIndex ≥ NextRefreshTurn.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(QuestsDomainSystem))]
    public partial struct QuestBoardRefreshSystem : ISystem
    {
        const uint RefreshCadenceTurns = 8;

        EntityQuery _boardQuery;
        Unity.Mathematics.Random _rng;

        public void OnCreate(ref SystemState state)
        {
            _boardQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<InnTag, BuildingTier, QuestBoardState, QuestBoardSlot>()
                .Build(ref state);
            _rng = new Unity.Mathematics.Random(0x71A2C9D3u);
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
            if (!db.Defs.IsCreated || db.Defs.Count() == 0) return;

            var entities = _boardQuery.ToEntityArray(Allocator.Temp);
            var tierLU   = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var stateLU  = SystemAPI.GetComponentLookup<QuestBoardState>(false);
            var slotsLU  = SystemAPI.GetBufferLookup<QuestBoardSlot>(false);

            for (int i = 0; i < entities.Length; i++)
            {
                var board = entities[i];
                var s = stateLU[board];
                if (turn < s.NextRefreshTurn) continue;

                byte tier = tierLU[board].Value;
                var slots = slotsLU[board];

                for (int k = slots.Length - 1; k >= 0; k--)
                    if (slots[k].ExpiresTurn != 0 && slots[k].ExpiresTurn <= turn)
                        slots.RemoveAtSwapBack(k);

                int needed = s.Capacity - slots.Length;
                if (needed > 0) FillSlots(slots, db.Defs, tier, turn, needed);

                s.NextRefreshTurn = turn + RefreshCadenceTurns;
                stateLU[board] = s;
            }

            entities.Dispose();
        }

        void FillSlots(DynamicBuffer<QuestBoardSlot> slots,
                       NativeHashMap<ushort, QuestDefRuntime> defs,
                       byte tier, uint turn, int needed)
        {
            var pool = new NativeList<ushort>(defs.Count(), Allocator.Temp);
            using (var keys = defs.GetKeyArray(Allocator.Temp))
            {
                for (int i = 0; i < keys.Length; i++)
                {
                    var def = defs[keys[i]];
                    if (def.InnTierMin > tier) continue;
                    if (Contains(slots, def.Id)) continue;
                    pool.Add(def.Id);
                }
            }
            if (pool.Length == 0) { pool.Dispose(); return; }

            int picks = math.min(needed, pool.Length);
            for (int p = 0; p < picks; p++)
            {
                int idx = (int)(_rng.NextUInt() % (uint)pool.Length);
                ushort qid = pool[idx];
                pool.RemoveAtSwapBack(idx);

                slots.Add(new QuestBoardSlot
                {
                    QuestId     = qid,
                    PostedTurn  = turn,
                    ExpiresTurn = turn + RefreshCadenceTurns * 2,
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
