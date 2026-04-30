using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Pre-handler for landmark demolitions — runs in <see cref="InitializationSystemGroup"/> before <see cref="DemolishBuildingSystem"/> destroys the entity. Reads the target's <see cref="LandmarkRef"/> shared-component slug and dispatches a per-flavor outcome (vengeful zombies on shrine teardown, free timber on felled trees, ore on broken veins, gold on demolished markets, soul-curse damage on cursed-relic refs). Resources land in the Capital ledger; spawns drop near the demolished hex via <see cref="UnitSpawnSystem"/> helpers. The DemolishBuildingSystem still runs after and physically destroys the entity — this system only adds the consequence side-effects, never blocks the demolish itself.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateBefore(typeof(DemolishBuildingSystem))]
    public partial class LandmarkDemolishConsequenceSystem : SystemBase
    {
        const int   ShrineZombieMin     = 4;
        const int   ShrineZombieMax     = 6;
        const int   ZombieSpawnRadius   = 2;
        const ushort TreeRefundTimber   = 8;
        const ushort VeinRefundOre      = 5;
        const ushort MarketRefundCoin   = 25;
        const int   CurseTargetCount    = 3;
        const float CurseDamageFrac     = 0.25f;

        EntityQuery _requestQuery;
        Unity.Mathematics.Random _rng = new Unity.Mathematics.Random(0xA5F00D5Au);

        protected override void OnCreate()
        {
            _requestQuery = GetEntityQuery(ComponentType.ReadOnly<DemolishRequest>());
        }

        protected override void OnUpdate()
        {
            if (_requestQuery.CalculateEntityCount() == 0) return;

            var em = EntityManager;
            using var arr = _requestQuery.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                var reqEntity = arr[i];
                if (!em.HasComponent<DemolishRequest>(reqEntity)) continue;
                var req = em.GetComponentData<DemolishRequest>(reqEntity);
                var target = req.Target;
                if (target == Entity.Null || !em.Exists(target)) continue;
                if (!em.HasComponent<Building>(target)) continue;
                if (em.GetComponentData<Building>(target).Type != BuildingType.Landmark) continue;
                if (!em.HasComponent<LandmarkRef>(target)) continue;

                var lr = em.GetSharedComponentManaged<LandmarkRef>(target);
                string slug = lr.Value.ToString();
                if (string.IsNullOrEmpty(slug)) continue;

                int2 hex = em.GetComponentData<Building>(target).RootHex;
                ApplyConsequence(slug, hex);
            }
        }

        void ApplyConsequence(string slug, int2 hex)
        {
            var category = ClassifySlug(slug);
            switch (category)
            {
                case Category.Shrine:    ShrineConsequence(hex);    break;
                case Category.Tree:      TreeConsequence();         break;
                case Category.Vein:      VeinConsequence(slug);     break;
                case Category.Market:    MarketConsequence();       break;
                case Category.Curse:     CurseConsequence();        break;
                default: break;
            }
        }

        enum Category : byte { None, Shrine, Tree, Vein, Market, Curse }

        static Category ClassifySlug(string slug)
        {
            switch (slug)
            {
                // Shrine / sacred-ground — demolition wakes restless dead.
                case "quiet-spring":
                case "the-still-pool":
                case "ember-hearth":
                case "luminous-alcove":
                    return Category.Shrine;

                // Tree — cleared landmark gives back timber.
                case "oak-tree":
                case "redwood-tree":
                    return Category.Tree;

                // Mineral vein — gives a stack of stone-block as compensation.
                case "iron-vein":
                case "silver-vein":
                case "gold-vein":
                case "copper-vein":
                case "coal-vein":
                case "salt-vein":
                case "cobalt-vein":
                case "mithril-vein":
                case "adamantine-vein":
                    return Category.Vein;

                // Market / outpost — recoverable trade goods turn into coin.
                case "sunken-market":
                case "dusty-bazaar":
                case "mushroom-bazaar":
                case "dwarven-outpost":
                    return Category.Market;

                // Cursed relic — wraith claims payment in HP from random units.
                case "shattered-crown":
                case "prismatic-throne":
                case "mirror-chamber":
                case "ruby-crystal":
                case "sapphire-crystal":
                case "jade-crystal":
                    return Category.Curse;

                default:
                    return Category.None;
            }
        }

        void ShrineConsequence(int2 hex)
        {
            int count = ShrineZombieMin + _rng.NextInt(0, ShrineZombieMax - ShrineZombieMin + 1);
            var em = EntityManager;
            for (int i = 0; i < count; i++)
            {
                int dq = _rng.NextInt(-ZombieSpawnRadius, ZombieSpawnRadius + 1);
                int dr = _rng.NextInt(-ZombieSpawnRadius, ZombieSpawnRadius + 1);
                uint seed = _rng.NextUInt() | 1u;
                UnitSpawnSystem.SpawnZombieAt(em, new int2(hex.x + dq, hex.y + dr), seed);
            }
            PublishToast("Restless dead rise from the desecrated shrine!", ToastKind.Warning);
        }

        void TreeConsequence()
        {
            if (!TryGetCapitalLedger(out var ledger)) return;
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Timber, TreeRefundTimber, UlidFactory.NewUid());
            PublishToast($"Felled — {TreeRefundTimber} timber stocked.", ToastKind.Success);
        }

        void VeinConsequence(string slug)
        {
            if (!TryGetCapitalLedger(out var ledger)) return;
            // All veins refund StoneBlock for now; future expansion can map
            // each vein slug to its dedicated ore item once those items ship.
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.StoneBlock, VeinRefundOre, UlidFactory.NewUid());
            PublishToast($"Vein cleared — {VeinRefundOre} stone delivered.", ToastKind.Success);
        }

        void MarketConsequence()
        {
            if (!TryGetCapitalLedger(out var ledger)) return;
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, MarketRefundCoin, UlidFactory.NewUid());
            PublishToast($"Market salvaged — {MarketRefundCoin} coin recovered.", ToastKind.Success);
        }

        void CurseConsequence()
        {
            // Damage up to N random Player units by a fraction of max HP.
            // Doesn't kill outright (clamped to 1 HP minimum) so the curse
            // is felt but never one-shots a unit.
            var em = EntityManager;
            var unitsQuery = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>(),
                ComponentType.ReadWrite<Health>());
            using var arr = unitsQuery.ToEntityArray(Allocator.Temp);
            int hits = 0;
            for (int i = 0; i < arr.Length && hits < CurseTargetCount; i++)
            {
                int idx = _rng.NextInt(0, arr.Length);
                var ent = arr[idx];
                if (em.GetComponentData<Faction>(ent).Value != FactionType.Player) continue;
                var h = em.GetComponentData<Health>(ent);
                float dmg = math.max(1f, h.Max * CurseDamageFrac);
                h.Value = math.max(1f, h.Value - dmg);
                em.SetComponentData(ent, h);
                hits++;
            }
            PublishToast("A wraith claims payment in blood!", ToastKind.Warning);
        }

        bool TryGetCapitalLedger(out DynamicBuffer<BankLedgerBase> ledger)
        {
            ledger = default;
            var em = EntityManager;
            var capQuery = em.CreateEntityQuery(ComponentType.ReadOnly<CapitalTag>());
            if (capQuery.CalculateEntityCount() == 0) return false;
            var capital = capQuery.GetSingletonEntity();
            if (!em.HasBuffer<CapitalLedger>(capital)) return false;
            ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            return true;
        }

        void PublishToast(string text, ToastKind kind)
        {
            try
            {
                var pub = GlobalMessagePipe.GetPublisher<ToastMessage>();
                pub?.Publish(new ToastMessage(text, kind));
            }
            catch { }
        }
    }
}
