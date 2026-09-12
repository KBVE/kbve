using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Entities;
using Unity.Mathematics;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Subscribes to <see cref="BuildingInspectMessage"/>; routes click-driven interaction kinds to gameplay payoffs. Shop dispenses a small bundle into the Capital ledger; Dungeon spawns a hostile encounter on a neighbour hex; QuestGiver / NpcDialog opens a dialogue tree. Each landmark carries its own <see cref="LandmarkVisitCooldown"/> so the player can't spam-claim. Shrine clicks fall through — <see cref="ShrineProductionSystem"/> auto-grants on territory / king visit.</summary>
    public sealed class LandmarkInteractSystem : IAsyncStartable, IDisposable
    {
        const uint   ShopCooldownTurns        = 5;
        const uint   DungeonCooldownTurns     = 10;
        const uint   DialogueCooldownTurns    = 3;
        const ushort ShopRewardCoin           = 40;
        const ushort ShopRewardHerb           = 1;
        const int    DungeonSpawnRingRadius   = 2;

        readonly ISubscriber<BuildingInspectMessage> _inspectSub;
        readonly IPublisher<ToastMessage>            _toastPub;
        readonly IPublisher<DialogueStartMessage>    _dialoguePub;

        IDisposable _subscription;
        Unity.Mathematics.Random _rng;

        [Inject]
        public LandmarkInteractSystem(
            ISubscriber<BuildingInspectMessage> inspectSub,
            IPublisher<ToastMessage>            toastPub,
            IPublisher<DialogueStartMessage>    dialoguePub)
        {
            _inspectSub  = inspectSub;
            _toastPub    = toastPub;
            _dialoguePub = dialoguePub;
            _rng         = new Unity.Mathematics.Random(0xC1A98B7Du);
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            var bag = DisposableBag.CreateBuilder();
            _inspectSub.Subscribe(OnInspect).AddTo(bag);
            _subscription = bag.Build();
            return UniTask.CompletedTask;
        }

        public void Dispose() => _subscription?.Dispose();

        void OnInspect(BuildingInspectMessage msg)
        {
            if (msg.Building == Entity.Null) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.Exists(msg.Building)) return;
            if (!em.HasComponent<LandmarkGameplay>(msg.Building)) return;

            var gp = em.GetComponentData<LandmarkGameplay>(msg.Building);
            if (gp.Interaction == LandmarkInteractionKind.None) return;
            if (gp.Interaction == LandmarkInteractionKind.Shrine) return;

            uint turn = TryReadTurn(em);
            if (!IsCooldownReady(em, msg.Building, turn)) return;

            switch (gp.Interaction)
            {
                case LandmarkInteractionKind.Shop:
                    HandleShop(em, msg.Building, turn);
                    ArmCooldown(em, msg.Building, turn + ShopCooldownTurns);
                    break;
                case LandmarkInteractionKind.Dungeon:
                    HandleDungeon(em, msg.Building, turn);
                    ArmCooldown(em, msg.Building, turn + DungeonCooldownTurns);
                    break;
                case LandmarkInteractionKind.QuestGiver:
                case LandmarkInteractionKind.NpcDialog:
                    HandleDialogue(em, msg.Building);
                    ArmCooldown(em, msg.Building, turn + DialogueCooldownTurns);
                    break;
            }
        }

        void HandleShop(EntityManager em, Entity landmark, uint turn)
        {
            int2 here = em.HasComponent<Building>(landmark)
                ? em.GetComponentData<Building>(landmark).RootHex
                : default;

            if (!CityRouter.TryGetNearestPlayerBank(em, here, out _, out var ledger))
            {
                _toastPub.Publish(new ToastMessage("No player city to receive supplies.", ToastKind.Warning));
                return;
            }

            long unixMs = TryReadUnixMs(em);
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, ShopRewardCoin, UlidFactory.NewUid(ref _rng, unixMs));
            BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Herb, ShopRewardHerb, UlidFactory.NewUid(ref _rng, unixMs));

            string title = ResolveTitle(em, landmark);
            string text = ZString.Concat(title, " — ", ShopRewardCoin.ToString(), " Coin, ", ShopRewardHerb.ToString(), " Herb.");
            _toastPub.Publish(new ToastMessage(text, ToastKind.Success));
        }

        void HandleDungeon(EntityManager em, Entity landmark, uint turn)
        {
            if (!em.HasComponent<Building>(landmark))
            {
                _toastPub.Publish(new ToastMessage("Arena is silent.", ToastKind.Info));
                return;
            }

            int2 root = em.GetComponentData<Building>(landmark).RootHex;
            int2 spawnHex = PickRingNeighbour(root, DungeonSpawnRingRadius);
            UnitSpawnSystem.SpawnBanditAt(em, spawnHex, _rng.NextUInt() | 1u);

            string title = ResolveTitle(em, landmark);
            _toastPub.Publish(new ToastMessage(ZString.Concat(title, " — a foe stirs from the depths."), ToastKind.Warning));
        }

        void HandleDialogue(EntityManager em, Entity landmark)
        {
            ushort treeId = DialogueTreeId.HelloWorld;
            _dialoguePub.Publish(new DialogueStartMessage(treeId));
        }

        bool IsCooldownReady(EntityManager em, Entity landmark, uint turn)
        {
            if (!em.HasComponent<LandmarkVisitCooldown>(landmark)) return true;
            return turn >= em.GetComponentData<LandmarkVisitCooldown>(landmark).NextEligibleTurn;
        }

        void ArmCooldown(EntityManager em, Entity landmark, uint nextTurn)
        {
            if (em.HasComponent<LandmarkVisitCooldown>(landmark))
                em.SetComponentData(landmark, new LandmarkVisitCooldown { NextEligibleTurn = nextTurn });
            else
                em.AddComponentData(landmark, new LandmarkVisitCooldown { NextEligibleTurn = nextTurn });
        }

        static uint TryReadTurn(EntityManager em)
        {
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<WorldClock>());
            if (q.IsEmpty) return 0;
            return em.GetComponentData<WorldClock>(q.GetSingletonEntity()).TurnIndex;
        }

        static long TryReadUnixMs(EntityManager em)
        {
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<WorldClock>());
            if (q.IsEmpty) return 0;
            return (long)(em.GetComponentData<WorldClock>(q.GetSingletonEntity()).AbsSeconds * 1000d);
        }

        static string ResolveTitle(EntityManager em, Entity landmark)
        {
            if (!em.HasComponent<LandmarkRef>(landmark)) return "Landmark";
            var lr = em.GetSharedComponentManaged<LandmarkRef>(landmark);
            string slug = lr.Value.ToString();
            if (string.IsNullOrEmpty(slug)) return "Landmark";
            if (MapdbCache.TryGetByRef(slug, out var def) && !string.IsNullOrEmpty(def.Name))
                return def.Name;
            return slug;
        }

        int2 PickRingNeighbour(int2 origin, int radius)
        {
            uint r = _rng.NextUInt() | 1u;
            int dx = (int)(r % (uint)(2 * radius + 1)) - radius;
            r = (r * 1664525u) + 1013904223u;
            int dy = (int)(r % (uint)(2 * radius + 1)) - radius;
            if (dx == 0 && dy == 0) dx = radius;
            return new int2(origin.x + dx, origin.y + dy);
        }
    }
}
