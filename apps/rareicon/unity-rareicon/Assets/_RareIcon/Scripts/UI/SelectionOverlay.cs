using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Draws the drag-select marquee rectangle while the player is holding-and-dragging the left button. A single absolute-positioned VisualElement is moved + resized each frame from MouseSnapshot; hidden when IsDragging is false.</summary>
    public sealed class SelectionOverlay : IAsyncStartable, IDisposable
    {
        readonly UIPanelManager _panelManager;
        readonly IMouseStateSource _mouse;

        readonly CompositeDisposable _disposables = new();

        VisualElement _marquee;

        [Inject]
        public SelectionOverlay(UIPanelManager panelManager, IMouseStateSource mouse)
        {
            _panelManager = panelManager;
            _mouse = mouse;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null) return;

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }
            if (uiDoc.rootVisualElement == null) return;

            // Inline-styled because SelectionOverlay attaches the marquee
            // straight to the UIDocument root, not through UIPanelLoader.
            // Loading styles.uss into rootVisualElement once would also
            // work but inlining keeps the overlay self-contained and
            // independent of the panel-loader timing.
            _marquee = new VisualElement { pickingMode = PickingMode.Ignore };
            _marquee.AddToClassList("drag-marquee");
            _marquee.style.position = Position.Absolute;
            _marquee.style.display = DisplayStyle.None;
            _marquee.style.backgroundColor = new StyleColor(new Color(0.99f, 0.83f, 0.30f, 0.20f));
            var border = new StyleColor(new Color(0.99f, 0.83f, 0.30f, 1.0f));
            _marquee.style.borderTopColor    = border;
            _marquee.style.borderRightColor  = border;
            _marquee.style.borderBottomColor = border;
            _marquee.style.borderLeftColor   = border;
            _marquee.style.borderTopWidth    = 2f;
            _marquee.style.borderRightWidth  = 2f;
            _marquee.style.borderBottomWidth = 2f;
            _marquee.style.borderLeftWidth   = 2f;
            uiDoc.rootVisualElement.Add(_marquee);
            _marquee.BringToFront();

            _mouse.Current.Subscribe(OnSnapshot).AddTo(_disposables);
        }

        void OnSnapshot(MouseSnapshot snap)
        {
            if (_marquee == null) return;
            if (!snap.IsDragging)
            {
                _marquee.style.display = DisplayStyle.None;
                return;
            }

            var panel = _marquee.panel;
            if (panel == null) return;

            var flippedPress   = new Vector2(snap.PressScreenPos.x, Screen.height - snap.PressScreenPos.y);
            var flippedCurrent = new Vector2(snap.ScreenPos.x,      Screen.height - snap.ScreenPos.y);
            Vector2 p0 = RuntimePanelUtils.ScreenToPanel(panel, flippedPress);
            Vector2 p1 = RuntimePanelUtils.ScreenToPanel(panel, flippedCurrent);

            float minX = math.min(p0.x, p1.x);
            float minY = math.min(p0.y, p1.y);
            float maxX = math.max(p0.x, p1.x);
            float maxY = math.max(p0.y, p1.y);

            _marquee.style.left   = minX;
            _marquee.style.top    = minY;
            _marquee.style.width  = maxX - minX;
            _marquee.style.height = maxY - minY;
            _marquee.style.display = DisplayStyle.Flex;
        }

        public void Dispose() => _disposables?.Dispose();
    }
}
