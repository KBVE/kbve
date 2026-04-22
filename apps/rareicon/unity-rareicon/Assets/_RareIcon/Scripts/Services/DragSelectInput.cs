using System;
using MessagePipe;
using R3;
using Unity.Mathematics;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Bridges MouseStateSource drag detection to the selection system. Watches MouseSnapshot; on drag end publishes a SelectionDragMessage with the world-space rect (press corner → release corner).</summary>
    public sealed class DragSelectInput : IStartable, IDisposable
    {
        readonly IMouseStateSource _mouse;
        readonly IPublisher<SelectionDragMessage> _dragPub;
        readonly AppStateController _appState;

        const float MinDragDistanceSq = 0.01f;

        IDisposable _subscription;

        [Inject]
        public DragSelectInput(
            IMouseStateSource mouse,
            IPublisher<SelectionDragMessage> dragPub,
            AppStateController appState)
        {
            _mouse = mouse;
            _dragPub = dragPub;
            _appState = appState;
        }

        public void Start()
        {
            var bag = DisposableBag.CreateBuilder();
            _mouse.Current
                .Subscribe(OnSnapshot)
                .AddTo(bag);

            _subscription = bag.Build();
        }

        void OnSnapshot(MouseSnapshot snap)
        {
            if (!ShouldPublishDrag(snap))
                return;

            var min = math.min(snap.PressWorldPos, snap.WorldPos);
            var max = math.max(snap.PressWorldPos, snap.WorldPos);

            _dragPub.Publish(new SelectionDragMessage(min, max));
        }

        bool ShouldPublishDrag(in MouseSnapshot snap)
        {
            if (!snap.DragEndedThisFrame)
                return false;

            if (snap.OverUI)
                return false;

            if (!_appState.CanAcceptWorldInput())
                return false;

            var delta = snap.WorldPos - snap.PressWorldPos;
            if (math.lengthsq(delta) < MinDragDistanceSq)
                return false;

            return true;
        }

        public void Dispose()
        {
            _subscription?.Dispose();
            _subscription = null;
        }
    }
}
