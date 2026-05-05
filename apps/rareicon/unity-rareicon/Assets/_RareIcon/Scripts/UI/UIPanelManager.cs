using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.UIElements;
using MessagePipe;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Manages all pooled UI panels. Panels are pre-created, never destroyed.
    /// Subscribes to MessagePipe for show/hide commands.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class UIPanelManager : MonoBehaviour
    {
        readonly Dictionary<string, UIPanel> _panels = new();
        readonly UniTaskCompletionSource<VisualElement> _rootReady = new();
        UIDocument _uiDocument;

        /// <summary>True once the underlying <see cref="UIDocument.rootVisualElement"/> exists. Panel consumers should prefer <see cref="WaitForRootAsync"/> over polling.</summary>
        public bool IsRootReady => _uiDocument != null && _uiDocument.rootVisualElement != null;

        /// <summary>Direct accessor — null until the first frame after Awake. Panels that need eager access should await <see cref="WaitForRootAsync"/> instead.</summary>
        public VisualElement RootElement => _uiDocument != null ? _uiDocument.rootVisualElement : null;

        /// <summary>One-shot awaitable that resolves with the document's <see cref="VisualElement"/> root the moment it becomes available. Subsequent awaits return the cached root immediately.</summary>
        public UniTask<VisualElement> WaitForRootAsync(CancellationToken cancellation = default)
        {
            return _rootReady.Task.AttachExternalCancellation(cancellation);
        }

        [Inject] LocaleService _locale;
        [Inject] ISubscriber<PanelShowMessage> _showSub;
        [Inject] ISubscriber<PanelHideMessage> _hideSub;
        [Inject] IUiPointerBlocker _uiBlocker;

        IDisposable _subscriptions;

        void Awake()
        {
            _uiDocument = GetComponent<UIDocument>();

            // Load PanelSettings from Resources, or create fallback
            if (_uiDocument.panelSettings == null)
            {
                var ps = Resources.Load<PanelSettings>("UI/PanelSettings");
                if (ps == null)
                {
                    ps = ScriptableObject.CreateInstance<PanelSettings>();
                    ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                    ps.referenceResolution = new Vector2Int(1920, 1080);
                    ps.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
                    ps.match = 0.5f;

                    // Try to load default theme
                    var theme = Resources.Load<ThemeStyleSheet>("UnityThemes/UnityDefaultRuntimeTheme");
                    if (theme != null) ps.themeStyleSheet = theme;
                }
                _uiDocument.panelSettings = ps;
            }

            _uiDocument.sortingOrder = 1000;
        }

        void Start()
        {
            _uiBlocker?.Register(_uiDocument);

            // Resolve the rootReady awaitable as soon as the UIDocument
            // populates its rootVisualElement. Awake is too early — Unity
            // builds the panel one frame later — so we poll one frame at
            // a time until it lands. UniTask.NextFrame keeps the loop
            // allocation-free + cancellation-friendly.
            ResolveRootWhenReady().Forget();

            var bag = DisposableBag.CreateBuilder();

            _showSub.Subscribe(msg =>
            {
                if (_panels.TryGetValue(msg.PanelKey, out var panel))
                    panel.Show();
            }).AddTo(bag);

            _hideSub.Subscribe(msg =>
            {
                if (_panels.TryGetValue(msg.PanelKey, out var panel))
                    panel.Hide();
            }).AddTo(bag);

            _subscriptions = bag.Build();
        }

        void OnDestroy()
        {
            _uiBlocker?.Unregister(_uiDocument);
            _subscriptions?.Dispose();
            _rootReady.TrySetCanceled();
        }

        async UniTaskVoid ResolveRootWhenReady()
        {
            const int MaxFrameWait = 240; // ~4 s at 60 fps — bail rather than spin forever
            int waited = 0;
            while (_uiDocument != null && _uiDocument.rootVisualElement == null && waited < MaxFrameWait)
            {
                await UniTask.NextFrame(this.GetCancellationTokenOnDestroy());
                waited++;
            }
            if (_uiDocument != null && _uiDocument.rootVisualElement != null)
                _rootReady.TrySetResult(_uiDocument.rootVisualElement);
        }

        /// <summary>
        /// Register a panel. Call during scene setup after creating the VisualElement tree.
        /// The panel starts hidden. Call ResolveAllText() after locale is set.
        /// </summary>
        public UIPanel Register(string key, VisualElement root)
        {
            var panel = new UIPanel(key, root);
            _panels[key] = panel;

            // Parent it under the UIDocument root
            _uiDocument.rootVisualElement.Add(root);

            return panel;
        }

        /// <summary>
        /// Resolve all localized text across all panels.
        /// Call once after the player selects their language on the title screen.
        /// </summary>
        public void ResolveAllText()
        {
            foreach (var panel in _panels.Values)
                panel.ResolveText(_locale);
        }

        public UIPanel Get(string key)
        {
            return _panels.TryGetValue(key, out var panel) ? panel : null;
        }
    }
}
