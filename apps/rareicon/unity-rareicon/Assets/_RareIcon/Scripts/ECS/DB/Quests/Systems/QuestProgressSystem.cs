using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>End-of-turn quest evaluator. No-ops unless <see cref="WorldClock"/>.TurnIndex advanced since last evaluation so the scan fires at most once per turn boundary. Walks the Player's <see cref="ActiveQuest"/> + matching <see cref="QuestProgress"/> slice, refreshes CurrentCount per objective kind, and flips any Active quest whose objectives all satisfy to <see cref="QuestStatus"/>.Completed with RewardPaid=0. Emits <see cref="QuestCompletedMessage"/> via <see cref="QuestEventSink"/>; <see cref="QuestRewardApplierSystem"/> pays the reward on the next tick via the Completed flag on the ActiveQuest row.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(LateSimulationSystemGroup))]
    public partial struct QuestProgressSystem : ISystem
    {
        EntityQuery _playerQ;
        EntityQuery _capitalQ;
        EntityQuery _buildingQ;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<QuestDBSingleton>();
            state.RequireForUpdate<WorldClock>();

            _playerQ   = new EntityQueryBuilder(Allocator.Temp).WithAll<PlayerTag>().Build(ref state);
            _capitalQ  = new EntityQueryBuilder(Allocator.Temp).WithAll<CapitalTag, CapitalLedger>().Build(ref state);
            _buildingQ = new EntityQueryBuilder(Allocator.Temp).WithAll<Building>().Build(ref state);
            state.RequireForUpdate(_playerQ);
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            ref var db = ref SystemAPI.GetSingletonRW<QuestDBSingleton>().ValueRW;
            if (clock.TurnIndex == db.LastEvaluatedTurn) return;
            db.LastEvaluatedTurn = clock.TurnIndex;

            // Resolve Player singleton buffers.
            var players = _playerQ.ToEntityArray(Allocator.Temp);
            if (players.Length == 0) { players.Dispose(); return; }
            Entity player = players[0];
            players.Dispose();

            var activeLookup   = SystemAPI.GetBufferLookup<ActiveQuest>();
            var progressLookup = SystemAPI.GetBufferLookup<QuestProgress>();
            var killLookup     = SystemAPI.GetBufferLookup<QuestKillTally>();
            if (!activeLookup.HasBuffer(player))   return;
            if (!progressLookup.HasBuffer(player)) return;
            var active   = activeLookup[player];
            var progress = progressLookup[player];
            var hasKills = killLookup.HasBuffer(player);
            var kills    = hasKills ? killLookup[player] : default;

            // Capital ledger snapshot — same view across every CollectItem objective.
            DynamicBuffer<BankLedgerBase> capitalLedger = default;
            bool hasLedger = false;
            {
                var caps = _capitalQ.ToEntityArray(Allocator.Temp);
                if (caps.Length > 0)
                {
                    var ledgerLookup = SystemAPI.GetBufferLookup<CapitalLedger>();
                    if (ledgerLookup.HasBuffer(caps[0]))
                    {
                        capitalLedger = ledgerLookup[caps[0]].Reinterpret<BankLedgerBase>();
                        hasLedger     = true;
                    }
                }
                caps.Dispose();
            }

            // Player-faction building tally by type — built once per tick.
            var buildCount = new NativeHashMap<byte, int>(8, Allocator.Temp);
            {
                var buildings = _buildingQ.ToComponentDataArray<Building>(Allocator.Temp);
                for (int i = 0; i < buildings.Length; i++)
                {
                    var b = buildings[i];
                    if (b.OwnerFaction != FactionType.Player) continue;
                    buildCount.TryGetValue(b.Type, out int c);
                    buildCount[b.Type] = c + 1;
                }
                buildings.Dispose();
            }

            for (int qi = 0; qi < active.Length; qi++)
            {
                var quest = active[qi];
                if (quest.Status != QuestStatus.Active) continue;

                bool allDone = true;
                int baseIdx  = qi * QuestDefRuntime.MaxObjectives;

                for (int oi = 0; oi < QuestDefRuntime.MaxObjectives; oi++)
                {
                    int idx = baseIdx + oi;
                    if (idx >= progress.Length) { allDone = false; break; }
                    var p = progress[idx];
                    if (p.Kind == QuestObjectiveKind.None) continue;

                    p.CurrentCount = Evaluate(p.Kind, p.TargetId,
                        quest.StartedTurn, clock.TurnIndex,
                        hasLedger, capitalLedger, hasKills, kills, buildCount);
                    progress[idx] = p;

                    if (p.CurrentCount < p.TargetCount) allDone = false;
                }

                if (allDone)
                {
                    quest.Status     = QuestStatus.Completed;
                    quest.RewardPaid = 0;
                    active[qi]       = quest;
                    QuestEventSink.AddCompleted(ref db.CompletedWriteBuffer, quest.QuestId);
                }
            }

            buildCount.Dispose();
        }

        static uint Evaluate(byte kind, ushort targetId, uint startedTurn, uint currentTurn,
                             bool hasLedger, in DynamicBuffer<BankLedgerBase> ledger,
                             bool hasKills, in DynamicBuffer<QuestKillTally> kills,
                             in NativeHashMap<byte, int> buildCount)
        {
            switch (kind)
            {
                case QuestObjectiveKind.SurviveTurns:
                    return currentTurn > startedTurn ? currentTurn - startedTurn : 0u;

                case QuestObjectiveKind.BuildBuilding:
                    return buildCount.TryGetValue((byte)targetId, out int c) ? (uint)c : 0u;

                case QuestObjectiveKind.CollectItem:
                    if (!hasLedger) return 0u;
                    int cc = BankLedgerOps.CountOf(ledger, targetId);
                    return (uint)(cc < 0 ? 0 : cc);

                case QuestObjectiveKind.KillUnitType:
                    if (!hasKills) return 0u;
                    for (int i = 0; i < kills.Length; i++)
                        if (kills[i].UnitType == (byte)targetId) return kills[i].Count;
                    return 0u;

                default:
                    return 0u;
            }
        }
    }
}
