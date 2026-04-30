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
        const int   LostGoblinSpawnCount  = 5;
        const int   LostGoblinSpawnRadius = 4;
        const int   RaiderMinCount        = 10;
        const int   RaiderMaxCount        = 18;
        const int   RaiderSpawnDistance   = 14;
        const int   BanditRaidMinCount    = 3;
        const int   BanditRaidMaxCount    = 5;
        const int   BanditRaidDistance    = 10;
        const int   WolfPackMinCount      = 3;
        const int   WolfPackMaxCount      = 4;
        const int   WolfSpawnRadius       = 2;
        const int   FallingStarMinDist    = 8;
        const int   FallingStarMaxDist    = 20;
        const ushort BarterTimberCost     = 30;
        const ushort BarterStoneReward    = 10;

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

                case WorldEventKind.WanderingHero:
                    SpawnWanderingHero();
                    break;

                case WorldEventKind.MerchantCaravan:
                    if (!CapitalHasItem((ushort)ItemId.Timber, BarterTimberCost))
                    {
                        _toastPub.Publish(new ToastMessage(
                            _locale.Get("toast.event.merchant_passes"), ToastKind.Info));
                        return;
                    }
                    _toastPub.Publish(new ToastMessage(
                        _locale.Get("toast.event.merchant_arrives"), ToastKind.Info));
                    _dialoguePub.Publish(new DialogueStartMessage(DialogueTreeId.MerchantCaravan));
                    break;

                case WorldEventKind.WolfPack:
                    SpawnWolfPack();
                    break;

                case WorldEventKind.BanditRaidMini:
                    SpawnBanditRaidMini();
                    break;

                case WorldEventKind.FallingStar:
                    SpawnFallingStar();
                    break;
            }
        }

        void OnDialogueEnded(DialogueEndedMessage msg)
        {
            // Choice index 0 == accept across the random-event trees
            // (matches DialogueDB tree authoring).
            if (msg.LastChoiceIndex != 0) return;

            switch (msg.TreeId)
            {
                case DialogueTreeId.LostGoblinBand: SpawnLostGoblins(); break;
                case DialogueTreeId.MerchantCaravan: ResolveMerchantBarter(); break;
            }
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

        bool TryGetCapitalEntity(out Entity capital, out int2 hex)
        {
            capital = Entity.Null;
            hex = int2.zero;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            var em = world.EntityManager;
            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<CapitalTag>(),
                ComponentType.ReadOnly<Building>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            if (arr.Length == 0) return false;
            capital = arr[0];
            hex = em.GetComponentData<Building>(arr[0]).RootHex;
            return true;
        }

        void SpawnWanderingHero()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;

            // Pick a hero role at random; falls into the existing hero
            // spawn pipeline so the unit picks up its trait roll, profession
            // bias, name, and HUD treatment via the shared SpawnHeroAt path.
            byte[] roles = { HeroRole.MasterBlacksmith, HeroRole.MasterCraftsman };
            byte role = roles[_rng.Next(0, roles.Length)];
            int2 hex = new int2(capitalHex.x + NextOffset(2), capitalHex.y + NextOffset(2));
            uint seed = unchecked((uint)_rng.Next() | 1u);
            var entity = UnitSpawnSystem.SpawnHeroAt(world.EntityManager, hex, seed, role);
            if (entity == Entity.Null) return;

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.wandering_hero"), ToastKind.Success));
        }

        void ResolveMerchantBarter()
        {
            if (!TryGetCapitalEntity(out var capital, out _)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasBuffer<CapitalLedger>(capital)) return;

            var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            if (BankLedgerOps.CountOf(ledger, (ushort)ItemId.Timber) < BarterTimberCost)
            {
                _toastPub.Publish(new ToastMessage(
                    _locale.Get("toast.event.merchant_no_funds"), ToastKind.Warning));
                return;
            }

            BankLedgerOps.RemoveItem(ref ledger, (ushort)ItemId.Timber, BarterTimberCost);
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.StoneBlock, BarterStoneReward, UlidFactory.NewUid());

            var sb = ZString.CreateStringBuilder();
            try
            {
                sb.AppendFormat(_locale.Get("toast.event.merchant_traded"), BarterTimberCost, BarterStoneReward);
                _toastPub.Publish(new ToastMessage(sb.ToString(), ToastKind.Success));
            }
            finally { sb.Dispose(); }
        }

        void SpawnWolfPack()
        {
            // Wolves prefer the edge of player territory — find the nearest
            // Farm to anchor the pack so the threat lands on a specific
            // production target. No farm = no event (toast skipped to avoid
            // empty-world false alarms).
            if (!TryGetFarmHex(out var farmHex))
            {
                if (!TryGetCapitalHex(out farmHex)) return;
                farmHex = new int2(farmHex.x + NextOffset(8), farmHex.y + NextOffset(8));
            }
            int count = WolfPackMinCount + _rng.Next(0, WolfPackMaxCount - WolfPackMinCount + 1);
            for (int i = 0; i < count; i++)
            {
                int2 hex = new int2(farmHex.x + NextOffset(WolfSpawnRadius),
                                    farmHex.y + NextOffset(WolfSpawnRadius));
                TrySpawnUnit(hex, FactionType.Beast, UnitType.Wolf);
            }
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.wolf_pack"), ToastKind.Warning));
        }

        void SpawnBanditRaidMini()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            int count = BanditRaidMinCount + _rng.Next(0, BanditRaidMaxCount - BanditRaidMinCount + 1);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2.0);
            int anchorQ = capitalHex.x + (int)Math.Round(Math.Cos(angle) * BanditRaidDistance);
            int anchorR = capitalHex.y + (int)Math.Round(Math.Sin(angle) * BanditRaidDistance);

            for (int i = 0; i < count; i++)
            {
                int2 hex = new int2(anchorQ + NextOffset(2), anchorR + NextOffset(2));
                TrySpawnGoblin(hex, FactionType.Hostile);
            }
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.bandit_raid_mini"), ToastKind.Warning));
        }

        void SpawnFallingStar()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            int dist = FallingStarMinDist + _rng.Next(0, FallingStarMaxDist - FallingStarMinDist + 1);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2.0);
            int2 hex = new int2(
                capitalHex.x + (int)Math.Round(Math.Cos(angle) * dist),
                capitalHex.y + (int)Math.Round(Math.Sin(angle) * dist));

            // "quiet-spring" is a shrine-flavored landmark already wired
            // through ShrineProductionSystem + LandmarkInteractSystem; the
            // event piggy-backs on that existing reward path instead of
            // shipping a bespoke shrine spawner.
            var entity = LandmarkSpawnSystem.SpawnAt("quiet-spring", hex);
            if (entity == Entity.Null) return;

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.falling_star"), ToastKind.Info));
        }

        bool TrySpawnUnit(int2 hex, byte faction, byte unitType)
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            uint rngSeed = unchecked((uint)_rng.Next() | 1u);
            var entity = UnitSpawnSystem.SpawnGoblinAt(world.EntityManager, hex, rngSeed,
                                                      default, faction, unitType);
            return entity != Entity.Null;
        }

        bool TryGetFarmHex(out int2 hex)
        {
            hex = int2.zero;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            var em = world.EntityManager;
            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<FarmTag>(),
                ComponentType.ReadOnly<Building>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            if (arr.Length == 0) return false;
            int pick = _rng.Next(0, arr.Length);
            hex = em.GetComponentData<Building>(arr[pick]).RootHex;
            return true;
        }

        bool CapitalHasItem(ushort itemId, ushort minCount)
        {
            if (!TryGetCapitalEntity(out var capital, out _)) return false;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            var em = world.EntityManager;
            if (!em.HasBuffer<CapitalLedger>(capital)) return false;
            var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            return BankLedgerOps.CountOf(ledger, itemId) >= minCount;
        }
    }
}
