using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Scans the Player's <see cref="ActiveQuest"/> buffer for quests in <see cref="QuestStatus"/>.Completed state with RewardPaid=0, pays the reward into Capital's <see cref="CapitalLedger"/>, latches RewardPaid=1, and enqueues <see cref="QuestDefRuntime"/>.NextQuestId onto PendingStart so <see cref="QuestSeedSystem"/> auto-starts the follow-up quest. Idempotent across ticks — re-runs no-op because the RewardPaid latch short-circuits. Decouples reward payment from the managed event bridge; no NativeQueue re-enqueue hack.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(LateSimulationSystemGroup))]
    [UpdateAfter(typeof(QuestProgressSystem))]
    public partial struct QuestRewardApplierSystem : ISystem
    {
        EntityQuery _playerQ;
        EntityQuery _capitalQ;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<QuestDBSingleton>();

            _playerQ  = new EntityQueryBuilder(Allocator.Temp).WithAll<PlayerTag>().Build(ref state);
            _capitalQ = new EntityQueryBuilder(Allocator.Temp).WithAll<CapitalTag, CapitalLedger>().Build(ref state);
            state.RequireForUpdate(_playerQ);
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<QuestDBSingleton>().ValueRW;

            var players = _playerQ.ToEntityArray(Allocator.Temp);
            if (players.Length == 0) { players.Dispose(); return; }
            Entity player = players[0];
            players.Dispose();

            var activeLookup = SystemAPI.GetBufferLookup<ActiveQuest>();
            if (!activeLookup.HasBuffer(player)) return;
            var active = activeLookup[player];

            DynamicBuffer<BankLedgerBase> ledger = default;
            bool hasLedger = false;
            {
                var caps = _capitalQ.ToEntityArray(Allocator.Temp);
                if (caps.Length > 0)
                {
                    var ledgerLookup = SystemAPI.GetBufferLookup<CapitalLedger>();
                    if (ledgerLookup.HasBuffer(caps[0]))
                    {
                        ledger    = ledgerLookup[caps[0]].Reinterpret<BankLedgerBase>();
                        hasLedger = true;
                    }
                }
                caps.Dispose();
            }

            for (int i = 0; i < active.Length; i++)
            {
                var q = active[i];
                if (q.Status != QuestStatus.Completed || q.RewardPaid != 0) continue;
                if (!db.Defs.TryGetValue(q.QuestId, out var def)) continue;

                if (def.RewardItemId != 0 && def.RewardItemCount > 0)
                {
                    if (!hasLedger) continue;
                    BankLedgerOps.AddItem(ref ledger, def.RewardItemId, def.RewardItemCount, default);
                }

                q.RewardPaid = 1;
                active[i]    = q;

                if (def.NextQuestId != QuestId.None)
                    db.PendingStart.Enqueue(def.NextQuestId);
            }
        }
    }
}
