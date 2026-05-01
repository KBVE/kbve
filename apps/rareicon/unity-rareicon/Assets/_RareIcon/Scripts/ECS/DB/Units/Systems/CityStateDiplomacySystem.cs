using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Drains player-emitted city-state diplomacy requests — Gift, Annex, Raze. Managed SystemBase because raze fires a toast + future loot drop, and annex flips Building/Faction structurally. Each request entity is destroyed after processing whether or not the action was honored.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(CityStateMoodDriftSystem))]
    public partial class CityStateDiplomacySystem : SystemBase
    {
        IPublisher<ToastMessage> _toastPub;
        Unity.Mathematics.Random _rng;

        protected override void OnCreate()
        {
            _rng = new Unity.Mathematics.Random(0xC1A1B0E9u);
        }

        protected override void OnUpdate()
        {
            var em = EntityManager;
            DrainGifts(em);
            DrainAnnexes(em);
            DrainRazes(em);
        }

        void DrainGifts(EntityManager em)
        {
            using var requests = GetEntityQuery(ComponentType.ReadOnly<CityStateGiftRequest>())
                .ToEntityArray(Allocator.Temp);
            if (requests.Length == 0) return;

            Entity capital = Entity.Null;
            if (SystemAPI.TryGetSingletonEntity<CapitalTag>(out var cap)) capital = cap;
            long unixMs = SystemAPI.HasSingleton<WorldClock>()
                ? (long)(SystemAPI.GetSingleton<WorldClock>().AbsSeconds * 1000d)
                : 0L;

            for (int i = 0; i < requests.Length; i++)
            {
                var reqEntity = requests[i];
                var req = em.GetComponentData<CityStateGiftRequest>(reqEntity);
                em.DestroyEntity(reqEntity);

                if (req.Target == Entity.Null || !em.Exists(req.Target)) continue;
                if (!em.HasComponent<CityStateDisposition>(req.Target)) continue;
                if (capital == Entity.Null || !em.HasBuffer<CapitalLedger>(capital)) continue;

                var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
                if (BankLedgerOps.CountOf(ledger, req.ItemId) < req.Amount) continue;
                BankLedgerOps.RemoveItem(ref ledger, req.ItemId, req.Amount);

                var disp = em.GetComponentData<CityStateDisposition>(req.Target);
                int newMood = math.min(100, disp.Mood + req.MoodGain);
                disp.Mood = (byte)newMood;
                em.SetComponentData(req.Target, disp);

                if (em.HasComponent<CityStateStatus>(req.Target))
                {
                    var s = em.GetComponentData<CityStateStatus>(req.Target);
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
                            em.SetComponentData(req.Target, new CityStateStatus { Value = newStatus });
                    }
                }
            }
        }

        void DrainAnnexes(EntityManager em)
        {
            using var requests = GetEntityQuery(ComponentType.ReadOnly<CityStateAnnexRequest>())
                .ToEntityArray(Allocator.Temp);
            if (requests.Length == 0) return;

            for (int i = 0; i < requests.Length; i++)
            {
                var reqEntity = requests[i];
                var req = em.GetComponentData<CityStateAnnexRequest>(reqEntity);
                em.DestroyEntity(reqEntity);

                if (req.Target == Entity.Null || !em.Exists(req.Target)) continue;
                if (!em.HasComponent<CityStateDisposition>(req.Target)) continue;
                if (!em.HasComponent<CityStateStatus>(req.Target)) continue;

                var disp = em.GetComponentData<CityStateDisposition>(req.Target);
                var status = em.GetComponentData<CityStateStatus>(req.Target);

                bool eligible = disp.Mood >= CityStateMoodBand.AnnexThreshold ||
                                status.Value == CityStateStatusValue.Vassal;
                if (!eligible) continue;

                em.SetComponentData(req.Target, new CityStateStatus { Value = CityStateStatusValue.Annexed });
                if (em.HasComponent<Faction>(req.Target))
                    em.SetComponentData(req.Target, new Faction { Value = FactionType.Player });
                if (em.HasComponent<TerritoryEmitter>(req.Target))
                {
                    var emit = em.GetComponentData<TerritoryEmitter>(req.Target);
                    emit.OwnerFaction = FactionType.Player;
                    em.SetComponentData(req.Target, emit);
                }
                if (em.HasComponent<CityStateTribute>(req.Target))
                    em.RemoveComponent<CityStateTribute>(req.Target);

                PublishToast("A city-state has joined the empire.", ToastKind.Success);
            }
        }

        void DrainRazes(EntityManager em)
        {
            using var requests = GetEntityQuery(ComponentType.ReadOnly<CityStateRazeRequest>())
                .ToEntityArray(Allocator.Temp);
            if (requests.Length == 0) return;

            Entity capital = Entity.Null;
            if (SystemAPI.TryGetSingletonEntity<CapitalTag>(out var cap)) capital = cap;
            long unixMs = SystemAPI.HasSingleton<WorldClock>()
                ? (long)(SystemAPI.GetSingleton<WorldClock>().AbsSeconds * 1000d)
                : 0L;

            for (int i = 0; i < requests.Length; i++)
            {
                var reqEntity = requests[i];
                var req = em.GetComponentData<CityStateRazeRequest>(reqEntity);
                em.DestroyEntity(reqEntity);

                if (req.Target == Entity.Null || !em.Exists(req.Target)) continue;
                if (!em.HasComponent<CityStateTag>(req.Target)) continue;

                if (capital != Entity.Null && em.HasBuffer<CapitalLedger>(capital))
                {
                    var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
                    BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, 80, UlidFactory.NewUid(ref _rng, unixMs));
                    BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.StoneBlock, 8, UlidFactory.NewUid(ref _rng, unixMs));
                }

                em.DestroyEntity(req.Target);
                PublishToast("A city-state has been razed.", ToastKind.Warning);
            }
        }

        void PublishToast(string text, ToastKind kind)
        {
            if (_toastPub == null)
            {
                try { _toastPub = GlobalMessagePipe.GetPublisher<ToastMessage>(); }
                catch { return; }
            }
            _toastPub?.Publish(new ToastMessage(text, kind));
        }
    }
}
