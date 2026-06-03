using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Rebuilds the world-level TaskOffer pool + dispatch context on cadence (§0-C). Keeps offer enumeration out of ProfessionDispatchSystem so the per-unit scoring loop reads one flat list and the world-scan cost amortises. BuildVersion increments each rebuild so the dispatcher can gate "full dispatch" frames off the singleton instead of owning its own timer. ISystem + [BurstCompile] — managed bootstrap lives in OnCreate; the per-frame cadence check + Rebuild run on Burst.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(ProfessionDispatchSystem))]
    public partial struct ProfessionOfferBuildSystem : ISystem
    {
        public const float BuildIntervalSeconds = 5f;

        Entity _singleton;
        float  _lastBuildTime;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ItemDBSingleton>();

            var db = new ProfessionOffersSingleton
            {
                Offers             = new NativeList<TaskOffer>(256, Allocator.Persistent),
                OffersPerKind      = new NativeArray<int>(ProfessionKind.Count, Allocator.Persistent),
                OffersSortedByKind = new NativeList<TaskOffer>(256, Allocator.Persistent),
                OfferKindStart     = new NativeArray<int>(ProfessionKind.Count, Allocator.Persistent),
                OfferKindCount     = new NativeArray<int>(ProfessionKind.Count, Allocator.Persistent),
                NeedyCaves         = new NativeList<NeedyCave>(4, Allocator.Persistent),
                BuildVersion       = 0,
            };
            _singleton = state.EntityManager.CreateEntity(typeof(ProfessionOffersSingleton));
            state.EntityManager.SetName(_singleton, "ProfessionOffers");
            state.EntityManager.SetComponentData(_singleton, db);

            _lastBuildTime = -BuildIntervalSeconds;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!state.EntityManager.Exists(_singleton)) return;
            var db = state.EntityManager.GetComponentData<ProfessionOffersSingleton>(_singleton);
            if (db.Offers.IsCreated)             db.Offers.Dispose();
            if (db.OffersPerKind.IsCreated)      db.OffersPerKind.Dispose();
            if (db.OffersSortedByKind.IsCreated) db.OffersSortedByKind.Dispose();
            if (db.OfferKindStart.IsCreated)     db.OfferKindStart.Dispose();
            if (db.OfferKindCount.IsCreated)     db.OfferKindCount.Dispose();
            if (db.NeedyCaves.IsCreated)         db.NeedyCaves.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float now = (float)SystemAPI.Time.ElapsedTime;
            if (now - _lastBuildTime < BuildIntervalSeconds) return;
            _lastBuildTime = now;

            Rebuild(ref state);
        }

        [BurstCompile]
        void Rebuild(ref SystemState state)
        {
            ref var db   = ref SystemAPI.GetSingletonRW<ProfessionOffersSingleton>().ValueRW;
            var itemDB   = SystemAPI.GetSingleton<ItemDBSingleton>();
            var capLookup  = SystemAPI.GetBufferLookup<CapitalLedger>(true);

            db.Offers.Clear();
            db.NeedyCaves.Clear();
            for (int i = 0; i < db.OffersPerKind.Length; i++) db.OffersPerKind[i] = 0;

            db.HasCapital = SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital);
            db.Capital    = capital;
            db.CapitalHex = db.HasCapital ? SystemAPI.GetComponent<Building>(capital).RootHex : default;

            db.HasFarm     = false;
            db.NearestFarm = Entity.Null;
            db.FarmHex     = default;
            foreach (var (b, e) in SystemAPI.Query<RefRO<Building>>().WithEntityAccess().WithAll<FarmTag>())
            {
                db.NearestFarm = e;
                db.FarmHex     = b.ValueRO.RootHex;
                db.HasFarm     = true;
                break;
            }

            foreach (var (statusRO, buildingRO, e) in
                     SystemAPI.Query<RefRO<CaveFoodStatus>, RefRO<Building>>()
                              .WithAll<GoblinCaveTag>()
                              .WithEntityAccess())
            {
                if (statusRO.ValueRO.IsNeedy == 0) continue;
                db.NeedyCaves.Add(new NeedyCave { Entity = e, Hex = buildingRO.ValueRO.RootHex });
            }

            db.CapitalHasFood = false;
            if (db.HasCapital && capLookup.HasBuffer(capital))
            {
                var capInv = capLookup[capital];
                for (int i = 0; i < capInv.Length; i++)
                {
                    if (capInv[i].Count == 0) continue;
                    if (itemDB.EnergyValue(capInv[i].ItemId) > 0f) { db.CapitalHasFood = true; break; }
                }
            }

            var offers = db.Offers;

            foreach (var (resRO, coordRO) in
                     SystemAPI.Query<RefRO<HexResources>, RefRO<HexCoord>>())
            {
                var res = resRO.ValueRO;
                var hex = new int2(coordRO.ValueRO.Q, coordRO.ValueRO.R);

                if ((res.Wood | res.Leaves | res.Branches) != 0)
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Lumberjack, Variant = OfferVariant.Default, Hex = hex });
                if (res.Stone != 0)
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Miner, Variant = OfferVariant.Default, Hex = hex });
                if ((res.Berries | res.Mushrooms | res.Herbs | res.Cactus) != 0)
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Looter, Variant = OfferVariant.LooterForage, Hex = hex });
            }

            foreach (var (coordRO, dropsRO) in
                     SystemAPI.Query<RefRO<HexCoord>, DynamicBuffer<ItemDrop>>())
            {
                if (dropsRO.Length == 0) continue;
                var hex = new int2(coordRO.ValueRO.Q, coordRO.ValueRO.R);
                offers.Add(new TaskOffer { Kind = ProfessionKind.Looter, Variant = OfferVariant.LooterDropPickup, Hex = hex });
            }

            if (db.HasFarm)
                offers.Add(new TaskOffer { Kind = ProfessionKind.Farmer, Variant = OfferVariant.Default, Hex = db.FarmHex, Target = db.NearestFarm });

            foreach (var (siteRO, e) in SystemAPI.Query<RefRO<ConstructionSite>>().WithEntityAccess())
            {
                offers.Add(new TaskOffer { Kind = ProfessionKind.Builder, Variant = OfferVariant.BuilderSite, Hex = siteRO.ValueRO.RootHex, Target = e });
            }

            foreach (var (bdRO, hpRO, e) in
                     SystemAPI.Query<RefRO<Building>, RefRO<BuildingHealth>>()
                              .WithNone<ConstructionSite>()
                              .WithEntityAccess())
            {
                if (bdRO.ValueRO.OwnerFaction != FactionType.Player) continue;
                if (hpRO.ValueRO.Value >= hpRO.ValueRO.Max) continue;
                offers.Add(new TaskOffer { Kind = ProfessionKind.Builder, Variant = OfferVariant.BuilderDamaged, Hex = bdRO.ValueRO.RootHex, Target = e });
            }

            if (db.HasCapital)
                offers.Add(new TaskOffer { Kind = ProfessionKind.Chef, Variant = OfferVariant.Default, Hex = db.CapitalHex, Target = db.Capital });

            foreach (var (barrackBuilding, barrackEntity) in
                     SystemAPI.Query<RefRO<Building>>().WithAll<BarracksTag>().WithEntityAccess())
            {
                offers.Add(new TaskOffer
                {
                    Kind    = ProfessionKind.Craftsman,
                    Variant = OfferVariant.Default,
                    Hex     = barrackBuilding.ValueRO.RootHex,
                    Target  = barrackEntity,
                });
            }

            foreach (var (furnaceBuilding, furnaceEntity) in
                     SystemAPI.Query<RefRO<Building>>().WithAll<FurnaceTag>().WithEntityAccess())
            {
                offers.Add(new TaskOffer
                {
                    Kind    = ProfessionKind.Blacksmith,
                    Variant = OfferVariant.Default,
                    Hex     = furnaceBuilding.ValueRO.RootHex,
                    Target  = furnaceEntity,
                });
            }

            for (int ci = 0; ci < db.NeedyCaves.Length; ci++)
                offers.Add(new TaskOffer { Kind = ProfessionKind.Looter, Variant = OfferVariant.LooterDeliver, Hex = db.NeedyCaves[ci].Hex, Target = db.NeedyCaves[ci].Entity });

            if (db.HasCapital && db.CapitalHasFood && db.NeedyCaves.Length > 0)
                offers.Add(new TaskOffer { Kind = ProfessionKind.Looter, Variant = OfferVariant.LooterFetch, Hex = db.CapitalHex, Target = db.Capital });

            var opk = db.OffersPerKind;
            for (int oi = 0; oi < offers.Length; oi++)
            {
                byte ok = offers[oi].Kind;
                if (ok < opk.Length) opk[ok]++;
            }

            // Counting sort offers by Kind into OffersSortedByKind so
            // ProfessionDispatchSystem can walk the slice for each kind
            // the unit cares about instead of scanning the global pool.
            var oks = db.OfferKindStart;
            var okc = db.OfferKindCount;
            int running = 0;
            for (int k = 0; k < ProfessionKind.Count; k++)
            {
                oks[k] = running;
                okc[k] = opk[k];
                running += opk[k];
            }

            var sorted = db.OffersSortedByKind;
            sorted.Clear();
            sorted.Length = offers.Length;
            var cursor = new NativeArray<int>(ProfessionKind.Count, Allocator.Temp);
            for (int oi = 0; oi < offers.Length; oi++)
            {
                var o = offers[oi];
                if (o.Kind >= ProfessionKind.Count) continue;
                int idx = oks[o.Kind] + cursor[o.Kind]++;
                sorted[idx] = o;
            }
            cursor.Dispose();

            db.BuildVersion++;
        }

        static int CountFood(in ItemDBSingleton itemDB, DynamicBuffer<BankLedgerBase> buf)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (itemDB.EnergyValue(buf[i].ItemId) <= 0f) continue;
                total += buf[i].Count;
            }
            return total;
        }
    }
}
