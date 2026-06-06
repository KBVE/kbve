using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
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
        const ushort HarvestCarrot        = 20;
        const ushort HarvestEgg           = 10;
        const ushort HarvestMeat          = 5;
        const ushort SageCoinReward       = 25;
        const int    EarthquakeMinTargets = 1;
        const int    EarthquakeMaxTargets = 3;
        const float  EarthquakeDamageFrac = 0.25f;
        const int    TreasureMinDist      = 25;
        const int    TreasureMaxDist      = 35;
        const int    GoblinCaveMinDist    = 16;
        const int    GoblinCaveMaxDist    = 24;
        const ushort GoblinCaveMaxHp      = 220;
        const int    LostCaravanMinDist   = 18;
        const int    LostCaravanMaxDist   = 28;
        const ushort LostCaravanCoin      = 30;
        const int    MigrationMinCount    = 6;
        const int    MigrationMaxCount    = 10;
        const int    MigrationSpawnRadius = 5;
        const ushort StrangerGoldGift     = 15;
        const int    PlagueMinTargets     = 3;
        const int    PlagueMaxTargets     = 5;
        const float  PlagueDamageFrac     = 0.30f;
        const int    CrowZombieMin        = 1;
        const int    CrowZombieMax        = 2;
        const int    CrowSpawnRadius      = 3;
        const int    GoblinVillageMinDist = 18;
        const int    GoblinVillageMaxDist = 28;
        const ushort GoblinVillageMaxHp   = 180;
        const byte   GoblinVillageRadius  = 2;
        const int    GoblinVillageDefenders = 4;
        const int    PirateCoveMinDist    = 20;
        const int    PirateCoveMaxDist    = 32;
        const int    PirateCoveSearchRing = 6;
        const ushort PirateCoveMaxHp      = 240;
        const byte   PirateCoveRadius     = 2;

        readonly LocaleService _locale;
        readonly ISubscriber<WorldEventTriggeredMessage> _eventSub;
        readonly ISubscriber<LandmarkDemolishedEvent>    _landmarkSub;
        readonly ISubscriber<DialogueEndedMessage>       _dialogueEndSub;
        readonly IPublisher<DialogueStartMessage>        _dialoguePub;
        readonly IPublisher<ToastMessage>                _toastPub;

        IDisposable _bag;
        readonly System.Random _rng = new();

        public WorldEventHandler(
            LocaleService locale,
            ISubscriber<WorldEventTriggeredMessage> eventSub,
            ISubscriber<LandmarkDemolishedEvent>    landmarkSub,
            ISubscriber<DialogueEndedMessage>       dialogueEndSub,
            IPublisher<DialogueStartMessage>        dialoguePub,
            IPublisher<ToastMessage>                toastPub)
        {
            _locale         = locale;
            _eventSub       = eventSub;
            _landmarkSub    = landmarkSub;
            _dialogueEndSub = dialogueEndSub;
            _dialoguePub    = dialoguePub;
            _toastPub       = toastPub;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            var b = DisposableBag.CreateBuilder();
            _eventSub.Subscribe(OnEvent).AddTo(b);
            _landmarkSub.Subscribe(OnLandmarkDemolished).AddTo(b);
            _dialogueEndSub.Subscribe(OnDialogueEnded).AddTo(b);
            _bag = b.Build();
            return UniTask.CompletedTask;
        }

        void OnLandmarkDemolished(LandmarkDemolishedEvent msg)
        {
            string slug = msg.Slug.ToString();
            if (string.IsNullOrEmpty(slug)) return;
            var category = ClassifyLandmarkSlug(slug);
            switch (category)
            {
                case LandmarkCategory.Shrine: ApplyShrineDemolish(msg.Hex); break;
                case LandmarkCategory.Tree:   ApplyTreeDemolish();         break;
                case LandmarkCategory.Vein:   ApplyVeinDemolish();         break;
                case LandmarkCategory.Market: ApplyMarketDemolish();       break;
                case LandmarkCategory.Curse:  ApplyCurseDemolish();        break;
            }
        }

        enum LandmarkCategory : byte { None, Shrine, Tree, Vein, Market, Curse }

        static LandmarkCategory ClassifyLandmarkSlug(string slug)
        {
            switch (slug)
            {
                case "quiet-spring":
                case "the-still-pool":
                case "ember-hearth":
                case "luminous-alcove":
                    return LandmarkCategory.Shrine;
                case "oak-tree":
                case "redwood-tree":
                    return LandmarkCategory.Tree;
                case "iron-vein":
                case "silver-vein":
                case "gold-vein":
                case "copper-vein":
                case "coal-vein":
                case "salt-vein":
                case "cobalt-vein":
                case "mithril-vein":
                case "adamantine-vein":
                    return LandmarkCategory.Vein;
                case "sunken-market":
                case "dusty-bazaar":
                case "mushroom-bazaar":
                case "dwarven-outpost":
                    return LandmarkCategory.Market;
                case "shattered-crown":
                case "prismatic-throne":
                case "mirror-chamber":
                case "ruby-crystal":
                case "sapphire-crystal":
                case "jade-crystal":
                    return LandmarkCategory.Curse;
                default:
                    return LandmarkCategory.None;
            }
        }

        void ApplyShrineDemolish(int2 hex)
        {
            const int ShrineZombieMin = 4;
            const int ShrineZombieMax = 6;
            const int ZombieRadius    = 2;
            int count = ShrineZombieMin + _rng.Next(0, ShrineZombieMax - ShrineZombieMin + 1);
            for (int i = 0; i < count; i++)
            {
                int dq = NextOffset(ZombieRadius);
                int dr = NextOffset(ZombieRadius);
                TrySpawnZombie(new int2(hex.x + dq, hex.y + dr));
            }
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.landmark.shrine_demolished"), ToastKind.Warning));
        }

        void ApplyTreeDemolish()
        {
            const ushort TreeRefundTimber = 8;
            if (!TryGetCapitalEntity(out var capital, out _)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasBuffer<CapitalLedger>(capital)) return;
            var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Timber, TreeRefundTimber, UlidFactory.NewUid());
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.landmark.tree_demolished"), ToastKind.Success));
        }

        void ApplyVeinDemolish()
        {
            const ushort VeinRefundOre = 5;
            if (!TryGetCapitalEntity(out var capital, out _)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasBuffer<CapitalLedger>(capital)) return;
            var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.StoneBlock, VeinRefundOre, UlidFactory.NewUid());
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.landmark.vein_demolished"), ToastKind.Success));
        }

        void ApplyMarketDemolish()
        {
            const ushort MarketRefundCoin = 25;
            if (!TryGetCapitalEntity(out var capital, out _)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasBuffer<CapitalLedger>(capital)) return;
            var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, MarketRefundCoin, UlidFactory.NewUid());
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.landmark.market_demolished"), ToastKind.Success));
        }

        void ApplyCurseDemolish()
        {
            const int   CurseTargetCount = 3;
            const float CurseDamageFrac  = 0.25f;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>(),
                ComponentType.ReadWrite<Health>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            int hits = 0;
            for (int i = 0; i < arr.Length && hits < CurseTargetCount; i++)
            {
                int idx = _rng.Next(0, arr.Length);
                var ent = arr[idx];
                if (em.GetComponentData<Faction>(ent).Value != FactionType.Player) continue;
                var h = em.GetComponentData<Health>(ent);
                float dmg = math.max(1f, h.Max * CurseDamageFrac);
                h.Value = math.max(1f, h.Value - dmg);
                em.SetComponentData(ent, h);
                hits++;
            }
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.landmark.curse_demolished"), ToastKind.Warning));
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

                case WorldEventKind.BountifulHarvest:
                    GrantBountifulHarvest();
                    break;

                case WorldEventKind.Earthquake:
                    ApplyEarthquakeDamage();
                    break;

                case WorldEventKind.TreasureCache:
                    SpawnTreasureCache();
                    break;

                case WorldEventKind.SagesBlessing:
                    GrantSagesBlessing();
                    break;

                case WorldEventKind.GoblinCaveStir:
                    SpawnGoblinCave();
                    break;

                case WorldEventKind.LostCaravan:
                    SpawnLostCaravan();
                    break;

                case WorldEventKind.Migration:
                    SpawnMigration();
                    break;

                case WorldEventKind.MysteriousStranger:
                    _toastPub.Publish(new ToastMessage(
                        _locale.Get("toast.event.stranger_arrives"), ToastKind.Info));
                    _dialoguePub.Publish(new DialogueStartMessage(DialogueTreeId.MysteriousStranger));
                    break;

                case WorldEventKind.PlagueOutbreak:
                    ApplyPlagueDamage();
                    break;

                case WorldEventKind.CrowOmen:
                    SpawnCrowOmen();
                    break;

                case WorldEventKind.GoblinVillageRising:
                    SpawnGoblinVillage();
                    break;

                case WorldEventKind.PirateCoveRising:
                    SpawnPirateCove();
                    break;
            }
        }

        void OnDialogueEnded(DialogueEndedMessage msg)
        {

            if (msg.TreeId == DialogueTreeId.LostGoblinBand && msg.LastChoiceIndex == 0)
            { SpawnLostGoblins(); return; }
            if (msg.TreeId == DialogueTreeId.MerchantCaravan && msg.LastChoiceIndex == 0)
            { ResolveMerchantBarter(); return; }
            if (msg.TreeId == DialogueTreeId.MysteriousStranger)
            { ResolveMysteriousStranger(msg.LastChoiceIndex); return; }
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

        void GrantBountifulHarvest()
        {
            if (!TryGetCapitalEntity(out var capital, out _)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasBuffer<CapitalLedger>(capital)) return;

            var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Carrot, HarvestCarrot, UlidFactory.NewUid());
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Egg,    HarvestEgg,    UlidFactory.NewUid());
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Meat,   HarvestMeat,   UlidFactory.NewUid());

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.bountiful_harvest"), ToastKind.Success));
        }

        void ApplyEarthquakeDamage()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Building>(),
                ComponentType.ReadWrite<BuildingHealth>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            if (arr.Length == 0) return;

            int targetCount = EarthquakeMinTargets + _rng.Next(0, EarthquakeMaxTargets - EarthquakeMinTargets + 1);
            int picked = 0;
            for (int i = 0; i < arr.Length && picked < targetCount; i++)
            {
                var b = em.GetComponentData<Building>(arr[i]);
                if (b.Type == BuildingType.Capital)             continue;
                if (b.OwnerFaction != FactionType.Player)        continue;
                if (!em.HasComponent<BuildingHealth>(arr[i]))    continue;

                var hp = em.GetComponentData<BuildingHealth>(arr[i]);
                int dmg = (int)math.max(1f, hp.Max * EarthquakeDamageFrac);
                int next = hp.Value - dmg;
                hp.Value = (ushort)math.max(0, next);
                em.SetComponentData(arr[i], hp);
                picked++;
            }

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.earthquake"), ToastKind.Warning));
        }

        void SpawnTreasureCache()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            int dist = TreasureMinDist + _rng.Next(0, TreasureMaxDist - TreasureMinDist + 1);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2.0);
            int2 hex = new int2(
                capitalHex.x + (int)Math.Round(Math.Cos(angle) * dist),
                capitalHex.y + (int)Math.Round(Math.Sin(angle) * dist));

            var entity = LandmarkSpawnSystem.SpawnAt("the-still-pool", hex);
            if (entity == Entity.Null) return;

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.treasure_cache"), ToastKind.Info));
        }

        void GrantSagesBlessing()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>(),
                ComponentType.ReadWrite<Health>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                if (em.GetComponentData<Faction>(arr[i]).Value != FactionType.Player) continue;
                var h = em.GetComponentData<Health>(arr[i]);
                if (h.Value >= h.Max) continue;
                h.Value = h.Max;
                em.SetComponentData(arr[i], h);
            }

            if (TryGetCapitalEntity(out var capital, out _) && em.HasBuffer<CapitalLedger>(capital))
            {
                var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
                BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, SageCoinReward, UlidFactory.NewUid());
            }

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.sage_blessing"), ToastKind.Success));
        }

        void SpawnLostCaravan()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            int dist = LostCaravanMinDist + _rng.Next(0, LostCaravanMaxDist - LostCaravanMinDist + 1);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2.0);
            int2 hex = new int2(
                capitalHex.x + (int)Math.Round(Math.Cos(angle) * dist),
                capitalHex.y + (int)Math.Round(Math.Sin(angle) * dist));

            var entity = LandmarkSpawnSystem.SpawnAt("luminous-alcove", hex);
            if (entity == Entity.Null) return;

            if (TryGetCapitalEntity(out var capital, out _))
            {
                var world = GameplayWorld.Resolve();
                if (world != null && world.IsCreated)
                {
                    var em = world.EntityManager;
                    if (em.HasBuffer<CapitalLedger>(capital))
                    {
                        var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
                        BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, LostCaravanCoin, UlidFactory.NewUid());
                    }
                }
            }

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.lost_caravan"), ToastKind.Info));
        }

        void SpawnMigration()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            int count = MigrationMinCount + _rng.Next(0, MigrationMaxCount - MigrationMinCount + 1);
            byte[] species = { UnitType.Chicken, UnitType.Sheep, UnitType.Cow };

            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            int spawned = 0;
            for (int i = 0; i < count; i++)
            {
                int dq = NextOffset(MigrationSpawnRadius);
                int dr = NextOffset(MigrationSpawnRadius);
                int2 hex = new int2(capitalHex.x + dq, capitalHex.y + dr);
                byte sp  = species[_rng.Next(0, species.Length)];
                uint seed = unchecked((uint)_rng.Next() | 1u);
                var entity = UnitSpawnSystem.SpawnAnimalAt(em, hex, seed, sp);
                if (entity != Entity.Null) spawned++;
            }
            if (spawned == 0) return;

            var sb = ZString.CreateStringBuilder();
            try
            {
                sb.AppendFormat(_locale.Get("toast.event.migration"), spawned);
                _toastPub.Publish(new ToastMessage(sb.ToString(), ToastKind.Success));
            }
            finally { sb.Dispose(); }
        }

        void ResolveMysteriousStranger(int choice)
        {

            switch (choice)
            {
                case 0:
                    if (TryGetCapitalEntity(out var capital, out _))
                    {
                        var world = GameplayWorld.Resolve();
                        if (world == null || !world.IsCreated) return;
                        var em = world.EntityManager;
                        if (em.HasBuffer<CapitalLedger>(capital))
                        {
                            var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
                            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, StrangerGoldGift, UlidFactory.NewUid());
                        }
                    }
                    _toastPub.Publish(new ToastMessage(
                        _locale.Get("toast.event.stranger_gold"), ToastKind.Success));
                    break;

                case 1:
                    HealAllPlayerUnits();
                    _toastPub.Publish(new ToastMessage(
                        _locale.Get("toast.event.stranger_blessing"), ToastKind.Success));
                    break;

                default:
                    _toastPub.Publish(new ToastMessage(
                        _locale.Get("toast.event.stranger_refuse"), ToastKind.Info));
                    break;
            }
        }

        void HealAllPlayerUnits()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>(),
                ComponentType.ReadWrite<Health>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                if (em.GetComponentData<Faction>(arr[i]).Value != FactionType.Player) continue;
                var h = em.GetComponentData<Health>(arr[i]);
                if (h.Value < h.Max) { h.Value = h.Max; em.SetComponentData(arr[i], h); }
            }
        }

        void ApplyPlagueDamage()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>(),
                ComponentType.ReadWrite<Health>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            int targetCount = PlagueMinTargets + _rng.Next(0, PlagueMaxTargets - PlagueMinTargets + 1);
            int picked = 0;
            for (int i = 0; i < arr.Length && picked < targetCount; i++)
            {
                int idx = _rng.Next(0, arr.Length);
                var ent = arr[idx];
                if (em.GetComponentData<Faction>(ent).Value != FactionType.Player) continue;
                var h = em.GetComponentData<Health>(ent);
                float dmg = math.max(1f, h.Max * PlagueDamageFrac);
                h.Value = math.max(1f, h.Value - dmg);
                em.SetComponentData(ent, h);
                picked++;
            }
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.plague"), ToastKind.Warning));
        }

        void SpawnCrowOmen()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;

            int2 anchor = capitalHex;
            var world = GameplayWorld.Resolve();
            if (world != null && world.IsCreated)
            {
                var em = world.EntityManager;
                var query = em.CreateEntityQuery(ComponentType.ReadOnly<Building>());
                using var arr = query.ToEntityArray(Allocator.Temp);
                if (arr.Length > 0)
                {
                    for (int tries = 0; tries < 4; tries++)
                    {
                        int idx = _rng.Next(0, arr.Length);
                        var b = em.GetComponentData<Building>(arr[idx]);
                        if (b.OwnerFaction != FactionType.Player) continue;
                        if (b.Type == BuildingType.Capital) continue;
                        anchor = b.RootHex;
                        break;
                    }
                }
            }

            int count = CrowZombieMin + _rng.Next(0, CrowZombieMax - CrowZombieMin + 1);
            for (int i = 0; i < count; i++)
            {
                int2 hex = new int2(anchor.x + NextOffset(CrowSpawnRadius),
                                    anchor.y + NextOffset(CrowSpawnRadius));
                TrySpawnZombie(hex);
            }
            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.crow_omen"), ToastKind.Warning));
        }

        bool TrySpawnZombie(int2 hex)
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            uint seed = unchecked((uint)_rng.Next() | 1u);
            var entity = UnitSpawnSystem.SpawnZombieAt(world.EntityManager, hex, seed);
            return entity != Entity.Null;
        }

        void SpawnGoblinCave()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            var prefabQuery = em.CreateEntityQuery(ComponentType.ReadOnly<BuildingPrefabSingleton>());
            if (prefabQuery.CalculateEntityCount() == 0) return;
            var prefab = prefabQuery.GetSingleton<BuildingPrefabSingleton>().Prefab;
            if (prefab == Entity.Null) return;

            int dist = GoblinCaveMinDist + _rng.Next(0, GoblinCaveMaxDist - GoblinCaveMinDist + 1);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2.0);
            int2 hex = new int2(
                capitalHex.x + (int)Math.Round(Math.Cos(angle) * dist),
                capitalHex.y + (int)Math.Round(Math.Sin(angle) * dist));

            float3 pos = HexMeshUtil.HexToWorld(hex.x, hex.y, 0.25f);
            pos.z = -0.6f;

            var cave = em.Instantiate(prefab);
            float scale = BuildingDB.GetVisualScale(BuildingType.GoblinCave);
            em.SetComponentData(cave, LocalTransform.FromPositionRotationScale(pos, quaternion.identity, scale));
            em.SetComponentData(cave, new Building
            {
                Type         = BuildingType.GoblinCave,
                RootHex      = hex,
                OwnerFaction = FactionType.Hostile,
            });
            em.SetComponentData(cave, new BuildingVisual { Value = BuildingType.GoblinCave });
            em.AddComponentData(cave, new BuildingHealth { Value = GoblinCaveMaxHp, Max = GoblinCaveMaxHp });
            em.AddComponent<GoblinCaveTag>(cave);
            em.AddComponent<HostileTerritoryRoot>(cave);
            em.AddComponentData(cave, new TerritoryEmitter
            {
                Center       = hex,
                Radius       = 2,
                OwnerFaction = FactionType.Hostile,
            });
            em.AddComponentData(cave, new Faction { Value = FactionType.Hostile });

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.goblin_cave"), ToastKind.Warning));
        }

        void SpawnGoblinVillage()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            var prefabQuery = em.CreateEntityQuery(ComponentType.ReadOnly<BuildingPrefabSingleton>());
            if (prefabQuery.CalculateEntityCount() == 0) return;
            var prefab = prefabQuery.GetSingleton<BuildingPrefabSingleton>().Prefab;
            if (prefab == Entity.Null) return;

            int dist = GoblinVillageMinDist + _rng.Next(0, GoblinVillageMaxDist - GoblinVillageMinDist + 1);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2.0);
            int2 hex = new int2(
                capitalHex.x + (int)Math.Round(Math.Cos(angle) * dist),
                capitalHex.y + (int)Math.Round(Math.Sin(angle) * dist));

            byte faction = (_rng.Next(0, 2) == 0) ? FactionType.Player : FactionType.Hostile;

            float3 pos = HexMeshUtil.HexToWorld(hex.x, hex.y, 0.25f);
            pos.z = -0.6f;

            var village = em.Instantiate(prefab);
            float scale = BuildingDB.GetVisualScale(BuildingType.GoblinCave);
            em.SetComponentData(village, LocalTransform.FromPositionRotationScale(pos, quaternion.identity, scale));
            em.SetComponentData(village, new Building
            {
                Type         = BuildingType.GoblinVillage,
                RootHex      = hex,
                OwnerFaction = faction,
            });
            em.SetComponentData(village, new BuildingVisual { Value = BuildingType.GoblinCave });
            em.AddComponentData(village, new BuildingHealth { Value = GoblinVillageMaxHp, Max = GoblinVillageMaxHp });
            em.AddComponent<GoblinVillageTag>(village);
            if (faction == FactionType.Hostile)
                em.AddComponent<HostileTerritoryRoot>(village);
            em.AddComponentData(village, new TerritoryEmitter
            {
                Center       = hex,
                Radius       = GoblinVillageRadius,
                OwnerFaction = faction,
            });
            em.AddComponentData(village, new Faction { Value = faction });

            uint nowTick = (uint)(UnityEngine.Time.time * 1000f);
            em.AddComponentData(village, new GoblinVillageState
            {
                NextRaidTick     = nowTick + 60000u,
                RaidCadenceTicks = 60000u,
                RaidPartySize    = 3,
            });

            for (int i = 0; i < GoblinVillageDefenders; i++)
            {
                int2 defHex = new int2(hex.x + NextOffset(GoblinVillageRadius),
                                       hex.y + NextOffset(GoblinVillageRadius));
                TrySpawnGoblin(defHex, faction);
            }

            string toastKey = faction == FactionType.Hostile
                ? "toast.event.goblin_village_hostile"
                : "toast.event.goblin_village_ally";
            var kind = faction == FactionType.Hostile ? ToastKind.Warning : ToastKind.Success;
            _toastPub.Publish(new ToastMessage(_locale.Get(toastKey), kind));
        }

        void SpawnPirateCove()
        {
            if (!TryGetCapitalHex(out var capitalHex)) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            var prefabQuery = em.CreateEntityQuery(ComponentType.ReadOnly<BuildingPrefabSingleton>());
            if (prefabQuery.CalculateEntityCount() == 0) return;
            var prefab = prefabQuery.GetSingleton<BuildingPrefabSingleton>().Prefab;
            if (prefab == Entity.Null) return;

            int dist = PirateCoveMinDist + _rng.Next(0, PirateCoveMaxDist - PirateCoveMinDist + 1);
            float angle = (float)(_rng.NextDouble() * Math.PI * 2.0);
            int2 anchor = new int2(
                capitalHex.x + (int)Math.Round(Math.Cos(angle) * dist),
                capitalHex.y + (int)Math.Round(Math.Sin(angle) * dist));

            if (!TryFindCoastalHex(em, anchor, PirateCoveSearchRing, out var hex)) return;

            float3 pos = HexMeshUtil.HexToWorld(hex.x, hex.y, 0.25f);
            pos.z = -0.6f;

            var cove = em.Instantiate(prefab);
            float scale = BuildingDB.GetVisualScale(BuildingType.PirateCove);
            em.SetComponentData(cove, LocalTransform.FromPositionRotationScale(pos, quaternion.identity, scale));
            em.SetComponentData(cove, new Building
            {
                Type         = BuildingType.PirateCove,
                RootHex      = hex,
                OwnerFaction = FactionType.Hostile,
            });
            em.SetComponentData(cove, new BuildingVisual { Value = BuildingType.GoblinCave });
            em.AddComponentData(cove, new BuildingHealth { Value = PirateCoveMaxHp, Max = PirateCoveMaxHp });
            em.AddComponent<PirateCoveTag>(cove);
            em.AddComponent<HostileTerritoryRoot>(cove);
            em.AddComponentData(cove, new TerritoryEmitter
            {
                Center       = hex,
                Radius       = PirateCoveRadius,
                OwnerFaction = FactionType.Hostile,
            });
            em.AddComponentData(cove, new Faction { Value = FactionType.Hostile });

            uint nowTick = (uint)(UnityEngine.Time.time * 1000f);
            em.AddComponentData(cove, new PirateCoveState
            {
                NextRaidTick     = nowTick + 50000u,
                RaidCadenceTicks = 50000u,
                RaidPartySize    = 2,
            });

            _toastPub.Publish(new ToastMessage(
                _locale.Get("toast.event.pirate_cove"), ToastKind.Warning));
        }

        bool TryFindCoastalHex(EntityManager em, int2 anchor, int searchRing, out int2 hex)
        {
            hex = anchor;
            for (int r = 0; r <= searchRing; r++)
            {
                for (int dx = -r; dx <= r; dx++)
                for (int dy = -r; dy <= r; dy++)
                {
                    if (math.abs(dx) != r && math.abs(dy) != r) continue;
                    int2 candidate = new int2(anchor.x + dx, anchor.y + dy);
                    if (!HexHoverSystem.TryGetHexEntity(candidate, out var hexEntity)) continue;
                    if (!em.HasComponent<BiomeType>(hexEntity)) continue;
                    byte biome = em.GetComponentData<BiomeType>(hexEntity).Value;
                    if (biome != BiomeGenerator.BIOME_RIVER) continue;
                    hex = candidate;
                    return true;
                }
            }
            return false;
        }
    }
}
