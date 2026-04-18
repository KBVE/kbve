using System;
using UnityEngine;
using UnityEngine.UIElements;
using MessagePipe;
using VContainer;
using Cysharp.Text;

namespace RareIcon
{
    /// <summary>
    /// Pooled hover info — bottom-right corner showing hovered hex info.
    /// MonoBehaviour with its own UIDocument. Created by RootLifetimeScope.
    /// Subscribes to HexHoverMessage, swaps text via i18n + ZString.
    /// Never destroyed, responsive layout.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class HexInfoPanel : MonoBehaviour
    {
        [Inject] LocaleService _locale;
        [Inject] ISubscriber<HexHoverMessage> _hoverSub;

        IDisposable _subscription;
        Label _biomeName;
        Label _hexCoord;
        VisualElement _panel;

        void Start()
        {
            var uiDoc = GetComponent<UIDocument>();

            // Load or create PanelSettings
            if (uiDoc.panelSettings == null)
            {
                var ps = Resources.Load<PanelSettings>("UI/PanelSettings");
                if (ps == null)
                {
                    ps = ScriptableObject.CreateInstance<PanelSettings>();
                    ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                    ps.referenceResolution = new Vector2Int(1920, 1080);
                    ps.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
                    ps.match = 0.5f;
                    var theme = Resources.Load<ThemeStyleSheet>("UnityThemes/UnityDefaultRuntimeTheme");
                    if (theme != null) ps.themeStyleSheet = theme;
                }
                uiDoc.panelSettings = ps;
            }
            uiDoc.sortingOrder = 999;

            // Wait a frame for rootVisualElement
            StartCoroutine(BuildUI(uiDoc));
        }

        System.Collections.IEnumerator BuildUI(UIDocument uiDoc)
        {
            yield return null; // wait one frame

            var root = uiDoc.rootVisualElement;
            if (root == null)
            {
                Debug.LogError("[HexInfoPanel] rootVisualElement is null");
                yield break;
            }

            // Full-screen container for anchoring
            var container = new VisualElement();
            container.style.flexGrow = 1;
            container.style.position = Position.Absolute;
            container.style.top = 0;
            container.style.left = 0;
            container.style.right = 0;
            container.style.bottom = 0;

            // Panel — bottom-right, responsive
            _panel = new VisualElement();
            _panel.style.position = Position.Absolute;
            _panel.style.bottom = new Length(2, LengthUnit.Percent);
            _panel.style.right = new Length(2, LengthUnit.Percent);
            _panel.style.backgroundColor = new Color(0.05f, 0.05f, 0.1f, 0.85f);
            _panel.style.paddingTop = 10;
            _panel.style.paddingBottom = 10;
            _panel.style.paddingLeft = 16;
            _panel.style.paddingRight = 16;
            _panel.style.borderTopLeftRadius = 8;
            _panel.style.borderTopRightRadius = 8;
            _panel.style.borderBottomLeftRadius = 8;
            _panel.style.borderBottomRightRadius = 8;
            _panel.style.borderTopWidth = 1;
            _panel.style.borderBottomWidth = 1;
            _panel.style.borderLeftWidth = 1;
            _panel.style.borderRightWidth = 1;
            _panel.style.borderTopColor = new Color(0.3f, 0.5f, 0.8f, 0.6f);
            _panel.style.borderBottomColor = new Color(0.3f, 0.5f, 0.8f, 0.6f);
            _panel.style.borderLeftColor = new Color(0.3f, 0.5f, 0.8f, 0.6f);
            _panel.style.borderRightColor = new Color(0.3f, 0.5f, 0.8f, 0.6f);
            _panel.style.minWidth = 160;

            _biomeName = new Label("---");
            _biomeName.style.color = Color.white;
            _biomeName.style.fontSize = 18;
            _biomeName.style.unityFontStyleAndWeight = FontStyle.Bold;
            _biomeName.style.marginBottom = 4;

            _hexCoord = new Label("");
            _hexCoord.style.color = new Color(0.6f, 0.7f, 0.8f, 1f);
            _hexCoord.style.fontSize = 13;

            _panel.Add(_biomeName);
            _panel.Add(_hexCoord);
            container.Add(_panel);
            root.Add(container);

            // Subscribe to hover
            var bag = DisposableBag.CreateBuilder();
            _hoverSub.Subscribe(OnHexHover).AddTo(bag);
            _subscription = bag.Build();

            Debug.Log("[HexInfoPanel] UI built and subscribed");
        }

        void OnHexHover(HexHoverMessage msg)
        {
            if (_biomeName == null) return;

            if (msg.IsLand)
            {
                _biomeName.text = _locale.GetBiomeName(msg.BiomeId);
            }
            else
            {
                _biomeName.text = _locale.Get("hex.empty");
            }
            _hexCoord.text = ZString.Format("{0} ({1}, {2})", _locale.Get("hex.coord"), msg.Q, msg.R);
        }

        void OnDestroy()
        {
            _subscription?.Dispose();
        }
    }
}
