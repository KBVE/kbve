using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Entities;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Subscribes to <see cref="BuildingInspectMessage"/>; routes click-driven interaction kinds (Shop / QuestGiver / Dungeon / NpcDialog) to their handlers. Shrine bonuses do NOT fire on click — <see cref="ShrineProductionSystem"/> grants them automatically when the territory or king-visit condition holds + the cadence elapses. Shrine clicks fall through to the info panel only.</summary>
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
            switch (gp.Interaction)
            {
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
    }
}
