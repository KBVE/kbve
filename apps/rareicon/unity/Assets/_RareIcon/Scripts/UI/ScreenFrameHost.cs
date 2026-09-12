using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Loads ScreenFrame.uxml at startup and exposes named regions other panels mount into. Replaces ad-hoc absolute positioning so two panels can't fight for the same anchor.</summary>
    public class ScreenFrameHost : IAsyncStartable
    {
        readonly UIPanelManager _panelManager;

        VisualElement _root;
        VisualElement _topLeft, _topCenter, _topRight;
        VisualElement _world;
        VisualElement _bottomLeft, _bottomCenter, _bottomRight;

        readonly UniTaskCompletionSource _ready = new();

        public VisualElement TopLeft      => _topLeft;
        public VisualElement TopCenter    => _topCenter;
        public VisualElement TopRight     => _topRight;
        public VisualElement WorldOverlay => _world;
        public VisualElement BottomLeft   => _bottomLeft;
        public VisualElement BottomCenter => _bottomCenter;
        public VisualElement BottomRight  => _bottomRight;

        /// <summary>Awaitable; resolves once the frame is mounted and regions are queryable.</summary>
        public UniTask Ready => _ready.Task;

        [Inject]
        public ScreenFrameHost(UIPanelManager panelManager)
        {
            _panelManager = panelManager;
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

            _root = UIPanelLoader.Load(uiDoc, "UI/ScreenFrame");
            if (_root == null) return;

            _root.SendToBack();

            _topLeft     = _root.Q<VisualElement>("region-top-left");
            _topCenter   = _root.Q<VisualElement>("region-top-center");
            _topRight    = _root.Q<VisualElement>("region-top-right");
            _world       = _root.Q<VisualElement>("region-world");
            _bottomLeft  = _root.Q<VisualElement>("region-bottom-left");
            _bottomCenter= _root.Q<VisualElement>("region-bottom-center");
            _bottomRight = _root.Q<VisualElement>("region-bottom-right");

            _ready.TrySetResult();
        }
    }
}
