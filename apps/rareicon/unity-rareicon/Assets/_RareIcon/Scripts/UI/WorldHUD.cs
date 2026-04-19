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
        readonly UIWorldSearch _worldSearch;
        readonly ISubscriber<HexHoverMessage> _hoverSub;

        readonly CompositeDisposable _disposables = new();

        VisualElement _hoverPanel;
        VisualElement _toolbar;
        Label _biomeName;
        Label _hexCoord;
        Label _creatureLine;
        Label _resourceLine;

        [Inject]
        public WorldHUD(
            LocaleService locale,
            UIPanelManager panelManager,
            AppStateController appState,
            UIWorldSearch worldSearch,
            ISubscriber<HexHoverMessage> hoverSub)
        {
            _locale = locale;
            _panelManager = panelManager;
            _appState = appState;
            _worldSearch = worldSearch;
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
                .Subscribe(state =>
                {
                    var display = state == AppInterfaceState.World ? DisplayStyle.Flex : DisplayStyle.None;
                    _hoverPanel.style.display = display;
                    _toolbar.style.display = display;
                })
                .AddTo(_disposables);
        }

        void BuildUI(VisualElement root)
        {
            BuildHoverPanel(root);
            BuildToolbar(root);
        }

        void BuildHoverPanel(VisualElement root)
        {
            _hoverPanel = new VisualElement();
            _hoverPanel.style.position = Position.Absolute;
            _hoverPanel.style.bottom = new Length(2, LengthUnit.Percent);
            _hoverPanel.style.right = new Length(2, LengthUnit.Percent);
            _hoverPanel.style.backgroundColor = new Color(0.05f, 0.05f, 0.1f, 0.85f);
            _hoverPanel.style.paddingTop = 10;
            _hoverPanel.style.paddingBottom = 10;
            _hoverPanel.style.paddingLeft = 16;
            _hoverPanel.style.paddingRight = 16;
            _hoverPanel.style.borderTopLeftRadius = 8;
            _hoverPanel.style.borderTopRightRadius = 8;
            _hoverPanel.style.borderBottomLeftRadius = 8;
            _hoverPanel.style.borderBottomRightRadius = 8;
            _hoverPanel.style.borderTopWidth = 1;
            _hoverPanel.style.borderBottomWidth = 1;
            _hoverPanel.style.borderLeftWidth = 1;
            _hoverPanel.style.borderRightWidth = 1;
            var border = new Color(0.3f, 0.5f, 0.8f, 0.6f);
            _hoverPanel.style.borderTopColor = border;
            _hoverPanel.style.borderBottomColor = border;
            _hoverPanel.style.borderLeftColor = border;
            _hoverPanel.style.borderRightColor = border;
            _hoverPanel.style.minWidth = 160;
            // Hover info shouldn't block world clicks underneath it.
            _hoverPanel.pickingMode = PickingMode.Ignore;

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

            _creatureLine = new Label("");
            _creatureLine.style.color = new Color(0.95f, 0.55f, 0.45f, 1f);
            _creatureLine.style.fontSize = 14;
            _creatureLine.style.marginTop = 4;
            _creatureLine.style.unityFontStyleAndWeight = FontStyle.Bold;
            _creatureLine.pickingMode = PickingMode.Ignore;

            _resourceLine = new Label("");
            _resourceLine.style.color = new Color(0.85f, 0.80f, 0.55f, 1f);
            _resourceLine.style.fontSize = 13;
            _resourceLine.style.marginTop = 4;
            _resourceLine.pickingMode = PickingMode.Ignore;

            _hoverPanel.Add(_biomeName);
            _hoverPanel.Add(_hexCoord);
            _hoverPanel.Add(_creatureLine);
            _hoverPanel.Add(_resourceLine);
            root.Add(_hoverPanel);
        }

        void BuildToolbar(VisualElement root)
        {
            // Top-left toolbar — opens the dedicated UIWorldSearch window.
            _toolbar = new VisualElement();
            _toolbar.style.position = Position.Absolute;
            _toolbar.style.top = new Length(2, LengthUnit.Percent);
            _toolbar.style.left = new Length(2, LengthUnit.Percent);
            _toolbar.style.flexDirection = FlexDirection.Row;

            var searchBtn = new Button(_worldSearch.Toggle) { text = "Search" };
            searchBtn.style.height = 28;
            searchBtn.style.paddingLeft = 12;
            searchBtn.style.paddingRight = 12;
            searchBtn.style.backgroundColor = new Color(0.15f, 0.20f, 0.32f, 0.95f);
            searchBtn.style.color = Color.white;
            searchBtn.style.fontSize = 13;
            searchBtn.style.unityFontStyleAndWeight = FontStyle.Bold;

            _toolbar.Add(searchBtn);
            root.Add(_toolbar);
        }

        void OnHexHover(HexHoverMessage msg)
        {
            if (_biomeName == null) return;

            _biomeName.text = msg.IsLand
                ? _locale.GetBiomeName(msg.BiomeId)
                : _locale.Get("hex.empty");

            _hexCoord.text = ZString.Format("{0} ({1}, {2})", _locale.Get("hex.coord"), msg.Q, msg.R);

            if (msg.UnitType != UnitType.None)
            {
                _creatureLine.text = _locale.GetCreatureName(msg.UnitType);
                _creatureLine.style.display = DisplayStyle.Flex;
            }
            else
            {
                _creatureLine.style.display = DisplayStyle.None;
            }

            if (msg.IsLand && (msg.Wood | msg.Stone | msg.Berries | msg.Mushrooms | msg.Herbs) != 0)
            {
                // ZString builder appends mutate the struct, so it can't be a
                // 'using var' (refs to using-vars are illegal). Manual dispose.
                var sb = ZString.CreateStringBuilder();
                try
                {
                    AppendResource(ref sb, msg.Wood,      ResourceType.Wood);
                    AppendResource(ref sb, msg.Stone,     ResourceType.Stone);
                    AppendResource(ref sb, msg.Berries,   ResourceType.Berries);
                    AppendResource(ref sb, msg.Mushrooms, ResourceType.Mushrooms);
                    AppendResource(ref sb, msg.Herbs,     ResourceType.Herbs);
                    _resourceLine.text = sb.ToString();
                }
                finally
                {
                    sb.Dispose();
                }
                _resourceLine.style.display = DisplayStyle.Flex;
            }
            else
            {
                _resourceLine.style.display = DisplayStyle.None;
            }
        }

        void AppendResource(ref Utf16ValueStringBuilder sb, byte amount, byte type)
        {
            if (amount == 0) return;
            if (sb.Length > 0) sb.Append('\n');
            sb.Append(_locale.GetResourceName(type));
            sb.Append(": ");
            sb.Append(amount);
        }

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}
