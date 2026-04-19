using System;
using System.Collections.Generic;
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
        UIDocument _uiDocument;

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
