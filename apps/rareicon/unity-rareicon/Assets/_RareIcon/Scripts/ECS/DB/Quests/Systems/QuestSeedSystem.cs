using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Drains <see cref="QuestStartRequest"/> entities and <see cref="QuestDBSingleton"/>.PendingStart, and attaches an <see cref="ActiveQuest"/> + <see cref="QuestDefRuntime.MaxObjectives"/> <see cref="QuestProgress"/> rows to the Player singleton for each new quest. Emits <see cref="QuestStartedMessage"/> via <see cref="QuestEventSink"/> into the write-buffer — <see cref="QuestsMessagePipeBridgeSystem"/> forwards on the main thread. Skips duplicates (same QuestId already Active). Runs in <see cref="InitializationSystemGroup"/> after <see cref="QuestsDomainSystem"/>.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(QuestsDomainSystem))]
    public partial struct QuestSeedSystem : ISystem
    {
        EntityQuery _playerQ;
        EntityQuery _requestQ;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<QuestDBSingleton>();

            _playerQ = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<PlayerTag>()
                .Build(ref state);
            state.RequireForUpdate(_playerQ);

            _requestQ = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<QuestStartRequest>()
                .Build(ref state);
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

            var activeLookup   = SystemAPI.GetBufferLookup<ActiveQuest>();
            var progressLookup = SystemAPI.GetBufferLookup<QuestProgress>();
            var killLookup     = SystemAPI.GetBufferLookup<QuestKillTally>();

            var ecb = SystemAPI.GetSingleton<BeginInitializationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            // Lazily attach the player-side buffers the first time we seed.
            if (!activeLookup.HasBuffer(player))   ecb.AddBuffer<ActiveQuest>(player);
            if (!progressLookup.HasBuffer(player)) ecb.AddBuffer<QuestProgress>(player);
            if (!killLookup.HasBuffer(player))     ecb.AddBuffer<QuestKillTally>(player);

            // Without buffers live yet we can't seed this tick — ECB will
            // attach them and we pick up next tick.
            if (!activeLookup.HasBuffer(player) || !progressLookup.HasBuffer(player)) return;

            var active   = activeLookup[player];
            var progress = progressLookup[player];
            uint turn    = SystemAPI.HasSingleton<WorldClock>()
                ? SystemAPI.GetSingleton<WorldClock>().TurnIndex
                : 0u;

            // Request-entity drain — queue then destroy.
            foreach (var (req, reqEntity) in
                     SystemAPI.Query<RefRO<QuestStartRequest>>().WithEntityAccess())
            {
                TryStart(req.ValueRO.QuestId, ref db, ref active, ref progress, turn);
                ecb.DestroyEntity(reqEntity);
            }

            // Pending-start drain — chained follow-up quests from the reward applier.
            while (db.PendingStart.TryDequeue(out ushort pendingId))
            {
                TryStart(pendingId, ref db, ref active, ref progress, turn);
            }
        }

        static void TryStart(ushort questId,
                             ref QuestDBSingleton db,
                             ref DynamicBuffer<ActiveQuest> active,
                             ref DynamicBuffer<QuestProgress> progress,
                             uint turn)
        {
            if (questId == QuestId.None) return;
            if (!db.Defs.TryGetValue(questId, out var def)) return;

            for (int i = 0; i < active.Length; i++)
                if (active[i].QuestId == questId && active[i].Status == QuestStatus.Active)
                    return;

            active.Add(new ActiveQuest
            {
                QuestId     = questId,
                Status      = QuestStatus.Active,
                RewardPaid  = 0,
                StartedTurn = turn,
            });

            // Always append MaxObjectives rows so (quest-slot * MaxObjectives + oi)
            // indexing stays constant-time across the progress buffer.
            progress.Add(ToProgress(def.Obj0));
            progress.Add(ToProgress(def.Obj1));
            progress.Add(ToProgress(def.Obj2));
            progress.Add(ToProgress(def.Obj3));

            QuestEventSink.AddStarted(ref db.StartedWriteBuffer, questId);
        }

        static QuestProgress ToProgress(in QuestObjectiveRuntime o) => new QuestProgress
        {
            Kind         = o.Kind,
            TargetId     = o.TargetId,
            TargetCount  = o.TargetCount,
            CurrentCount = 0,
        };
    }
}
