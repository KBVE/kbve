using System;
using MessagePipe;
using R3;
using Unity.Mathematics;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Bridges MouseStateSource drag detection to the selection system. Watches MouseSnapshot; on drag end publishes a SelectionDragMessage with the world-space rect (press corner → release corner).</summary>
    public sealed class DragSelectInput : IStartable, IDisposable
    {
        readonly IMouseStateSource _mouse;
        readonly IPublisher<SelectionDragMessage> _dragPub;

        IDisposable _sub;

        public DragSelectInput(IMouseStateSource mouse,
                               IPublisher<SelectionDragMessage> dragPub)
        {
            _mouse = mouse;
            _dragPub = dragPub;
        }

        public void Start()
        {
            _sub = _mouse.Current.Subscribe(OnSnapshot);
        }

        void OnSnapshot(MouseSnapshot snap)
        {
            if (!snap.DragEndedThisFrame) return;
            if (snap.OverUI) return;

            var min = math.min(snap.PressWorldPos, snap.WorldPos);
            var max = math.max(snap.PressWorldPos, snap.WorldPos);
            _dragPub.Publish(new SelectionDragMessage(min, max));
        }

        public void Dispose() => _sub?.Dispose();
    }
}
