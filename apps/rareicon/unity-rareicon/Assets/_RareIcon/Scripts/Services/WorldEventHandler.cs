using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Reacts to <see cref="WorldEventTriggeredMessage"/>: opens the right dialogue tree for player-decision events (Lost Goblin Band) and triggers spawns directly for unilateral events (Raider Swarm). For two-stage events, listens for <see cref="DialogueEndedMessage"/> to read the player's choice and acts on accept (spawn allies) or refuse (toast only).</summary>
    public sealed class WorldEventHandler : IAsyncStartable, IDisposable
    {
        const int   LostGoblinSpawnCount = 5;
        const int   LostGoblinSpawnRadius = 4;
        const int   RaiderMinCount       = 10;
        const int   RaiderMaxCount       = 18;
        const int   RaiderSpawnDistance  = 14;

        readonly LocaleService _locale;
        readonly ISubscriber<WorldEventTriggeredMessage> _eventSub;
        readonly ISubscriber<DialogueEndedMessage>       _dialogueEndSub;
        readonly IPublisher<DialogueStartMessage>        _dialoguePub;
        readonly IPublisher<ToastMessage>                _toastPub;

        IDisposable _bag;
        readonly System.Random _rng = new();

        public WorldEventHandler(
            LocaleService locale,
            ISubscriber<WorldEventTriggeredMessage> eventSub,
            ISubscriber<DialogueEndedMessage>       dialogueEndSub,
            IPublisher<DialogueStartMessage>        dialoguePub,
            IPublisher<ToastMessage>                toastPub)
        {
            _locale         = locale;
            _eventSub       = eventSub;
            _dialogueEndSub = dialogueEndSub;
            _dialoguePub    = dialoguePub;
            _toastPub       = toastPub;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            var b = DisposableBag.CreateBuilder();
            _eventSub.Subscribe(OnEvent).AddTo(b);
            _dialogueEndSub.Subscribe(OnDialogueEnded).AddTo(b);
            _bag = b.Build();
            return UniTask.CompletedTask;
        }

        public void Dispose() => _bag?.Dispose();

        void OnEvent(WorldEventTriggeredMessage msg)
        {
            switch (msg.Kind)
            {
                case WorldEventKind.LostGoblinBand:
                    _toastPub.Publish(new ToastMessage(
                        _locale.Get("toast.event.lost_goblins"), ToastKind.Info));
                    _dialoguePub.Publish(new DialogueStartMessage(DialogueTreeId.LostGoblinBand));
                    break;

                case WorldEventKind.RaiderSwarm:
                    _toastPub.Publish(new ToastMessage(
                        _locale.Get("toast.event.raider_swarm"), ToastKind.Warning));
                    _dialoguePub.Publish(new DialogueStartMessage(DialogueTreeId.RaiderSwarmWarning));
                    SpawnRaiders();
                    break;
            }
        }

        void OnDialogueEnded(DialogueEndedMessage msg)
        {
            if (msg.TreeId != DialogueTreeId.LostGoblinBand) return;
            // Choice index 0 == accept (matches DialogueDB tree authoring).
            if (msg.LastChoiceIndex != 0) return;
            SpawnLostGoblins();
        }

        void SpawnLostGoblins()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;

            int spawned = 0;
            for (int i = 0; i < LostGoblinSpawnCount; i++)
            {
                int dq = NextOffset(LostGoblinSpawnRadius);
                int dr = NextOffset(LostGoblinSpawnRadius);
                int2 hex = new int2(capitalHex.x + dq, capitalHex.y + dr);
                if (TrySpawnGoblin(hex, FactionType.Player)) spawned++;
            }

            if (spawned == 0) return;
            var sb = ZString.CreateStringBuilder();
            try
            {
                sb.AppendFormat(_locale.Get("toast.event.goblins_joined"), spawned);
                _toastPub.Publish(new ToastMessage(sb.ToString(), ToastKind.Success));
            }
            finally { sb.Dispose(); }
        }

        void SpawnRaiders()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;

            int count = RaiderMinCount + _rng.Next(0, RaiderMaxCount - RaiderMinCount + 1);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2.0);
            int   anchorQ = capitalHex.x + (int)Math.Round(Math.Cos(angle) * RaiderSpawnDistance);
            int   anchorR = capitalHex.y + (int)Math.Round(Math.Sin(angle) * RaiderSpawnDistance);

            for (int i = 0; i < count; i++)
            {
                int dq = NextOffset(2);
                int dr = NextOffset(2);
                TrySpawnGoblin(new int2(anchorQ + dq, anchorR + dr), FactionType.Hostile);
            }
        }

        int NextOffset(int radius)
        {
            return _rng.Next(-radius, radius + 1);
        }

        bool TrySpawnGoblin(int2 hex, byte faction)
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            uint rngSeed = unchecked((uint)_rng.Next() | 1u);
            var entity = UnitSpawnSystem.SpawnGoblinAt(world.EntityManager, hex, rngSeed,
                                                      default, faction, UnitType.Goblin);
            return entity != Entity.Null;
        }

        bool TryGetCapitalHex(out int2 hex)
        {
            hex = int2.zero;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            var em = world.EntityManager;
            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<CapitalTag>(),
                ComponentType.ReadOnly<Building>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            if (arr.Length == 0) return false;
            hex = em.GetComponentData<Building>(arr[0]).RootHex;
            return true;
        }
    }
}
