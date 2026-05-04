using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains player-emitted city-state diplomacy requests — Gift, Annex, Raze. Burst ISystem off main thread: structural changes go through ECB, ledger reads/writes via lookups + buffer reinterpret in-job, toast publishes routed through <see cref="PendingToast"/> carrier entities so the managed <see cref="MessagePipe"/> publisher only fires from <see cref="ToastBridgeSystem"/>. Three Burst jobs scheduled in serial — they all touch the capital ledger so they can't safely parallelize against each other.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(CityStateMoodDriftSystem))]
    public partial struct CityStateDiplomacySystem : ISystem
    {
        EntityQuery _giftQuery;
        EntityQuery _annexQuery;
        EntityQuery _razeQuery;
        EntityQuery _anyRequestQuery;

        Random _rng;

        public void OnCreate(ref SystemState state)
        {
            _rng = new Random(0xC1A1B0E9u);

            _giftQuery  = state.GetEntityQuery(ComponentType.ReadOnly<CityStateGiftRequest>());
            _annexQuery = state.GetEntityQuery(ComponentType.ReadOnly<CityStateAnnexRequest>());
            _razeQuery  = state.GetEntityQuery(ComponentType.ReadOnly<CityStateRazeRequest>());

            _anyRequestQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAny<CityStateGiftRequest, CityStateAnnexRequest, CityStateRazeRequest>()
                .Build(ref state);

            state.RequireForUpdate(_anyRequestQuery);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            Entity capital = Entity.Null;
            if (SystemAPI.TryGetSingletonEntity<CapitalTag>(out var cap)) capital = cap;

            long unixMs = SystemAPI.HasSingleton<WorldClock>()
                ? (long)(SystemAPI.GetSingleton<WorldClock>().AbsSeconds * 1000d)
                : 0L;

            var dispLookup     = SystemAPI.GetComponentLookup<CityStateDisposition>(false);
            var statusLookup   = SystemAPI.GetComponentLookup<CityStateStatus>(false);
            var factionLookup  = SystemAPI.GetComponentLookup<Faction>(false);
            var territoryLookup= SystemAPI.GetComponentLookup<TerritoryEmitter>(false);
            var tributeLookup  = SystemAPI.GetComponentLookup<CityStateTribute>(true);
            var ledgerLookup   = SystemAPI.GetBufferLookup<CapitalLedger>(false);
            var tagLookup      = SystemAPI.GetComponentLookup<CityStateTag>(true);

            uint seed = _rng.NextUInt();
            if (seed == 0u) seed = 1u;
            _rng.state = seed;

            state.Dependency = new GiftJob
            {
                Capital      = capital,
                LedgerLookup = ledgerLookup,
                DispLookup   = dispLookup,
                StatusLookup = statusLookup,
                Ecb          = ecb,
            }.Schedule(_giftQuery, state.Dependency);

            state.Dependency = new AnnexJob
            {
                DispLookup      = dispLookup,
                StatusLookup    = statusLookup,
                FactionLookup   = factionLookup,
                TerritoryLookup = territoryLookup,
                TributeLookup   = tributeLookup,
                Ecb             = ecb,
            }.Schedule(_annexQuery, state.Dependency);

            state.Dependency = new RazeJob
            {
                Capital      = capital,
                UnixMs       = unixMs,
                BaseSeed     = seed,
                LedgerLookup = ledgerLookup,
                TagLookup    = tagLookup,
                Ecb          = ecb,
            }.Schedule(_razeQuery, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct GiftJob : IJobEntity
    {
        public Entity Capital;
        public BufferLookup<CapitalLedger> LedgerLookup;
        public ComponentLookup<CityStateDisposition> DispLookup;
        public ComponentLookup<CityStateStatus>      StatusLookup;
        public EntityCommandBuffer Ecb;

        void Execute(Entity reqEntity, in CityStateGiftRequest req)
        {
            Ecb.DestroyEntity(reqEntity);

            if (req.Target == Entity.Null) return;
            if (!DispLookup.HasComponent(req.Target)) return;
            if (Capital == Entity.Null || !LedgerLookup.HasBuffer(Capital)) return;

            var ledger = LedgerLookup[Capital].Reinterpret<BankLedgerBase>();
            if (BankLedgerOps.CountOf(ledger, req.ItemId) < req.Amount) return;
            BankLedgerOps.RemoveItem(ref ledger, req.ItemId, req.Amount);

            var disp = DispLookup[req.Target];
            int newMood = math.min(100, disp.Mood + req.MoodGain);
            disp.Mood = (byte)newMood;
            DispLookup[req.Target] = disp;

            if (StatusLookup.HasComponent(req.Target))
            {
                var s = StatusLookup[req.Target];
                if (s.Value != CityStateStatusValue.Vassal &&
                    s.Value != CityStateStatusValue.Annexed &&
                    s.Value != CityStateStatusValue.Razed)
                {
                    byte newStatus = newMood < CityStateMoodBand.HostileMax
                        ? CityStateStatusValue.Hostile
                        : newMood >= CityStateMoodBand.AlliedMin
                            ? CityStateStatusValue.Allied
                            : CityStateStatusValue.Neutral;
                    if (newStatus != s.Value)
                        StatusLookup[req.Target] = new CityStateStatus { Value = newStatus };
                }
            }
        }
    }

    [BurstCompile]
    public partial struct AnnexJob : IJobEntity
    {
        public ComponentLookup<CityStateDisposition> DispLookup;
        public ComponentLookup<CityStateStatus>      StatusLookup;
        public ComponentLookup<Faction>              FactionLookup;
        public ComponentLookup<TerritoryEmitter>     TerritoryLookup;
        [Unity.Collections.ReadOnly] public ComponentLookup<CityStateTribute> TributeLookup;
        public EntityCommandBuffer Ecb;

        void Execute(Entity reqEntity, in CityStateAnnexRequest req)
        {
            Ecb.DestroyEntity(reqEntity);

            if (req.Target == Entity.Null) return;
            if (!DispLookup.HasComponent(req.Target)) return;
            if (!StatusLookup.HasComponent(req.Target)) return;

            var disp = DispLookup[req.Target];
            var status = StatusLookup[req.Target];

            bool eligible = disp.Mood >= CityStateMoodBand.AnnexThreshold ||
                            status.Value == CityStateStatusValue.Vassal;
            if (!eligible) return;

            StatusLookup[req.Target] = new CityStateStatus { Value = CityStateStatusValue.Annexed };
            if (FactionLookup.HasComponent(req.Target))
                FactionLookup[req.Target] = new Faction { Value = FactionType.Player };
            if (TerritoryLookup.HasComponent(req.Target))
            {
                var emit = TerritoryLookup[req.Target];
                emit.OwnerFaction = FactionType.Player;
                TerritoryLookup[req.Target] = emit;
            }
            if (TributeLookup.HasComponent(req.Target))
                Ecb.RemoveComponent<CityStateTribute>(req.Target);

            var carrier = Ecb.CreateEntity();
            Ecb.AddComponent(carrier, new PendingToast
            {
                Kind = (byte)ToastKind.Success,
                Text = "A city-state has joined the empire.",
            });
        }
    }

    [BurstCompile]
    public partial struct RazeJob : IJobEntity
    {
        public Entity Capital;
        public long   UnixMs;
        public uint   BaseSeed;
        public BufferLookup<CapitalLedger>           LedgerLookup;
        [Unity.Collections.ReadOnly] public ComponentLookup<CityStateTag> TagLookup;
        public EntityCommandBuffer Ecb;

        void Execute(Entity reqEntity, [EntityIndexInQuery] int idx, in CityStateRazeRequest req)
        {
            Ecb.DestroyEntity(reqEntity);

            if (req.Target == Entity.Null) return;
            if (!TagLookup.HasComponent(req.Target)) return;

            if (Capital != Entity.Null && LedgerLookup.HasBuffer(Capital))
            {
                var ledger = LedgerLookup[Capital].Reinterpret<BankLedgerBase>();
                var rng = new Random(BaseSeed ^ ((uint)idx * 0x9E3779B1u + 1u));
                BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin,       80, UlidFactory.NewUid(ref rng, UnixMs));
                BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.StoneBlock,  8, UlidFactory.NewUid(ref rng, UnixMs));
            }

            Ecb.DestroyEntity(req.Target);

            var carrier = Ecb.CreateEntity();
            Ecb.AddComponent(carrier, new PendingToast
            {
                Kind = (byte)ToastKind.Warning,
                Text = "A city-state has been razed.",
            });
        }
    }
}
