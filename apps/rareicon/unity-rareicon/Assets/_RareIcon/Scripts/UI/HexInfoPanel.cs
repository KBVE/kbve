using System;
using System.Threading;
using UnityEngine;
using UnityEngine.UIElements;
using MessagePipe;
using VContainer;
using VContainer.Unity;
using Cysharp.Text;
using Cysharp.Threading.Tasks;

namespace RareIcon
{
    /// <summary>
    /// Pooled hover info — bottom-right corner showing hovered hex info.
    /// IAsyncStartable + IDisposable for VContainer-managed lifecycle.
    /// Subscribes to HexHoverMessage, swaps text via i18n + ZString.
    /// </summary>
    public class HexInfoPanel : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly ISubscriber<HexHoverMessage> _hoverSub;

        IDisposable _subscription;
        Label _biomeName;
        Label _hexCoord;
        VisualElement _panel;

        [Inject]
        public HexInfoPanel(LocaleService locale, UIPanelManager panelManager, ISubscriber<HexHoverMessage> hoverSub)
        {
            _locale = locale;
            _panelManager = panelManager;
            _hoverSub = hoverSub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[HexInfoPanel] UIPanelManager has no UIDocument");
                return;
            }

            // Wait for rootVisualElement
            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }

            if (uiDoc.rootVisualElement == null)
            {
                Debug.LogError("[HexInfoPanel] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _hoverSub.Subscribe(OnHexHover).AddTo(bag);
            _subscription = bag.Build();

            Debug.Log("[HexInfoPanel] Created");
        }

        void BuildUI(VisualElement root)
        {
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
            var border = new Color(0.3f, 0.5f, 0.8f, 0.6f);
            _panel.style.borderTopColor = border;
            _panel.style.borderBottomColor = border;
            _panel.style.borderLeftColor = border;
            _panel.style.borderRightColor = border;
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
            root.Add(_panel);
        }

        void OnHexHover(HexHoverMessage msg)
        {
            if (_biomeName == null) return;

            if (msg.IsLand)
                _biomeName.text = _locale.GetBiomeName(msg.BiomeId);
            else
                _biomeName.text = _locale.Get("hex.empty");

            _hexCoord.text = ZString.Format("{0} ({1}, {2})", _locale.Get("hex.coord"), msg.Q, msg.R);
        }

        public void Dispose()
        {
            _subscription?.Dispose();
            Debug.Log("[HexInfoPanel] Disposed");
        }
    }
}
