using System;
using System.Threading;
using UnityEngine;
using UnityEngine.UIElements;
using MessagePipe;
using VContainer;
using VContainer.Unity;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using R3;

namespace RareIcon
{
    /// <summary>
    /// Bottom-right hover info — visible only in AppInterfaceState.World.
    /// (Renamed from HexInfoPanel; future world-map widgets land here.)
    /// </summary>
    public class WorldHUD : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly AppStateController _appState;
        readonly ISubscriber<HexHoverMessage> _hoverSub;

        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        Label _biomeName;
        Label _hexCoord;

        [Inject]
        public WorldHUD(
            LocaleService locale,
            UIPanelManager panelManager,
            AppStateController appState,
            ISubscriber<HexHoverMessage> hoverSub)
        {
            _locale = locale;
            _panelManager = panelManager;
            _appState = appState;
            _hoverSub = hoverSub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[WorldHUD] UIPanelManager has no UIDocument");
                return;
            }

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }

            if (uiDoc.rootVisualElement == null)
            {
                Debug.LogError("[WorldHUD] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _hoverSub.Subscribe(OnHexHover).AddTo(bag);
            _disposables.Add(bag.Build());

            _appState.Current
                .Subscribe(state => _root.style.display =
                    state == AppInterfaceState.World ? DisplayStyle.Flex : DisplayStyle.None)
                .AddTo(_disposables);
        }

        void BuildUI(VisualElement root)
        {
            _root = new VisualElement();
            _root.style.position = Position.Absolute;
            _root.style.bottom = new Length(2, LengthUnit.Percent);
            _root.style.right = new Length(2, LengthUnit.Percent);
            _root.style.backgroundColor = new Color(0.05f, 0.05f, 0.1f, 0.85f);
            _root.style.paddingTop = 10;
            _root.style.paddingBottom = 10;
            _root.style.paddingLeft = 16;
            _root.style.paddingRight = 16;
            _root.style.borderTopLeftRadius = 8;
            _root.style.borderTopRightRadius = 8;
            _root.style.borderBottomLeftRadius = 8;
            _root.style.borderBottomRightRadius = 8;
            _root.style.borderTopWidth = 1;
            _root.style.borderBottomWidth = 1;
            _root.style.borderLeftWidth = 1;
            _root.style.borderRightWidth = 1;
            var border = new Color(0.3f, 0.5f, 0.8f, 0.6f);
            _root.style.borderTopColor = border;
            _root.style.borderBottomColor = border;
            _root.style.borderLeftColor = border;
            _root.style.borderRightColor = border;
            _root.style.minWidth = 160;
            // Hover info shouldn't block world clicks underneath it.
            _root.pickingMode = PickingMode.Ignore;

            _biomeName = new Label("---");
            _biomeName.style.color = Color.white;
            _biomeName.style.fontSize = 18;
            _biomeName.style.unityFontStyleAndWeight = FontStyle.Bold;
            _biomeName.style.marginBottom = 4;
            _biomeName.pickingMode = PickingMode.Ignore;

            _hexCoord = new Label("");
            _hexCoord.style.color = new Color(0.6f, 0.7f, 0.8f, 1f);
            _hexCoord.style.fontSize = 13;
            _hexCoord.pickingMode = PickingMode.Ignore;

            _root.Add(_biomeName);
            _root.Add(_hexCoord);
            root.Add(_root);
        }

        void OnHexHover(HexHoverMessage msg)
        {
            if (_biomeName == null) return;

            _biomeName.text = msg.IsLand
                ? _locale.GetBiomeName(msg.BiomeId)
                : _locale.Get("hex.empty");

            _hexCoord.text = ZString.Format("{0} ({1}, {2})", _locale.Get("hex.coord"), msg.Q, msg.R);
        }

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}
