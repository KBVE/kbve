using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Entities;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Subscribes to <see cref="BuildingInspectMessage"/>; when the target carries a <see cref="LandmarkGameplay"/> with a recognised interaction kind, executes the per-kind handler. Shrine = grant reward + arm cooldown. Shop / QuestGiver / Dungeon stubbed for follow-up. Toast feedback via existing pipeline.</summary>
    public sealed class LandmarkInteractSystem : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<BuildingInspectMessage> _inspectSub;
        readonly IPublisher<ToastMessage> _toastPub;
        IDisposable _subscription;

        [Inject]
        public LandmarkInteractSystem(
            ISubscriber<BuildingInspectMessage> inspectSub,
            IPublisher<ToastMessage> toastPub)
        {
            _inspectSub = inspectSub;
            _toastPub   = toastPub;
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
            uint nowTick = (uint)(UnityEngine.Time.time * 1000f);
            if (nowTick < gp.NextReadyTick)
            {
                _toastPub.Publish(new ToastMessage("Still cooling down…", ToastKind.Info));
                return;
            }

            switch (gp.Interaction)
            {
                case LandmarkInteractionKind.Shrine:
                    if (HandleShrine(em, msg.Building))
                    {
                        gp.NextReadyTick = nowTick + (uint)(gp.CooldownSecs * 1000);
                        em.SetComponentData(msg.Building, gp);
                    }
                    break;
                case LandmarkInteractionKind.Shop:
                case LandmarkInteractionKind.QuestGiver:
                case LandmarkInteractionKind.Dungeon:
                case LandmarkInteractionKind.NpcDialog:
                    _toastPub.Publish(new ToastMessage("Interaction not yet wired.", ToastKind.Info));
                    break;
                default:
                    return;
            }
        }

        bool HandleShrine(EntityManager em, Entity landmark)
        {
            if (!em.HasComponent<LandmarkShrine>(landmark)) return false;
            var shrine = em.GetComponentData<LandmarkShrine>(landmark);

            if (!CapitalLocator.TryGetEntity(out var capital)) return false;
            if (!em.HasBuffer<CapitalLedger>(capital))         return false;
            var treasury = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            if (shrine.RewardCoin > 0)
                BankLedgerOps.AddItem(ref treasury, (ushort)ItemId.Coin, (ushort)shrine.RewardCoin);

            if (em.HasBuffer<LandmarkShrineRewardItem>(landmark))
            {
                var rewards = em.GetBuffer<LandmarkShrineRewardItem>(landmark);
                for (int i = 0; i < rewards.Length; i++)
                    if (rewards[i].ItemId != 0 && rewards[i].Amount > 0)
                        BankLedgerOps.AddItem(ref treasury, rewards[i].ItemId, rewards[i].Amount);
            }

            _toastPub.Publish(new ToastMessage("Shrine offered its blessing.", ToastKind.Success));
            return true;
        }
    }
}
