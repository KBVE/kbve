using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Subscribes to <see cref="LandmarkInspectMessage"/>, resolves the landmark's name + description from MapdbCache via its <see cref="LandmarkRef"/>, and surfaces them as a ToastMessage. v1 — swap for a dedicated panel when designs land.</summary>
    public sealed class LandmarkInspectorService : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<LandmarkInspectMessage> _inspectSub;
        readonly IPublisher<ToastMessage> _toastPub;
        IDisposable _subscription;

        [Inject]
        public LandmarkInspectorService(
            ISubscriber<LandmarkInspectMessage> inspectSub,
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

        void OnInspect(LandmarkInspectMessage msg)
        {
            if (msg.Landmark == Entity.Null) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.Exists(msg.Landmark)) return;
            if (!em.HasComponent<Landmark>(msg.Landmark)) return;

            string refSlug = string.Empty;
            if (em.HasComponent<LandmarkRef>(msg.Landmark))
            {
                var lr = em.GetSharedComponentManaged<LandmarkRef>(msg.Landmark);
                refSlug = lr.Value.ToString();
            }

            string title = refSlug;
            string body  = string.Empty;
            if (!string.IsNullOrEmpty(refSlug)
                && MapdbCache.TryGetByRef(refSlug, out var def))
            {
                if (!string.IsNullOrEmpty(def.Name))        title = def.Name;
                if (!string.IsNullOrEmpty(def.Description)) body  = def.Description;
            }

            string text = string.IsNullOrEmpty(body)
                ? title
                : ZString.Concat(title, " — ", body);
            _toastPub.Publish(new ToastMessage(text, ToastKind.Info));
        }
    }
}
