using System;
using System.Threading;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using R3;

namespace RareIcon
{
    /// <summary>
    /// In-tile player HUD — visible only in AppInterfaceState.InTile.
    /// Scaffolding only: shows the entered tile's coord/biome and an Exit button.
    /// Future: health bar, minimap, hotbar, etc.
    /// </summary>
    public class TileHUD : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly AppStateController _appState;

        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        Label _tileLabel;
        Button _exitButton;

        [Inject]
        public TileHUD(
            LocaleService locale,
            UIPanelManager panelManager,
            AppStateController appState)
        {
            _locale = locale;
            _panelManager = panelManager;
            _appState = appState;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[TileHUD] UIPanelManager has no UIDocument");
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
                Debug.LogError("[TileHUD] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            _appState.Current
                .Subscribe(OnAppStateChanged)
                .AddTo(_disposables);
        }

        void BuildUI(VisualElement root)
        {
            _root = new VisualElement();
            _root.style.position = Position.Absolute;
            _root.style.top = new Length(2, LengthUnit.Percent);
            _root.style.left = new Length(2, LengthUnit.Percent);
            _root.style.flexDirection = FlexDirection.Row;
            _root.style.alignItems = Align.Center;
            _root.style.backgroundColor = new Color(0.05f, 0.10f, 0.05f, 0.85f);
            _root.style.paddingTop = 8;
            _root.style.paddingBottom = 8;
            _root.style.paddingLeft = 14;
            _root.style.paddingRight = 14;
            _root.style.borderTopLeftRadius = 8;
            _root.style.borderTopRightRadius = 8;
            _root.style.borderBottomLeftRadius = 8;
            _root.style.borderBottomRightRadius = 8;
            var border = new Color(0.4f, 0.7f, 0.4f, 0.7f);
            _root.style.borderTopColor = border;
            _root.style.borderBottomColor = border;
            _root.style.borderLeftColor = border;
            _root.style.borderRightColor = border;
            _root.style.borderTopWidth = 1;
            _root.style.borderBottomWidth = 1;
            _root.style.borderLeftWidth = 1;
            _root.style.borderRightWidth = 1;

            _tileLabel = new Label("");
            _tileLabel.style.color = Color.white;
            _tileLabel.style.fontSize = 16;
            _tileLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
            _tileLabel.style.marginRight = 12;

            _exitButton = new Button(OnExit) { text = "Exit" };
            _exitButton.style.height = 28;
            _exitButton.style.fontSize = 13;
            _exitButton.style.backgroundColor = new Color(0.3f, 0.2f, 0.2f, 1f);
            _exitButton.style.color = Color.white;

            _root.Add(_tileLabel);
            _root.Add(_exitButton);
            root.Add(_root);

            _root.style.display = DisplayStyle.None;
        }

        void OnAppStateChanged(AppInterfaceState state)
        {
            if (_root == null) return;

            if (state == AppInterfaceState.InTile)
            {
                var tile = _appState.CurrentTile;
                _tileLabel.text = ZString.Format(
                    "{0} ({1}, {2})",
                    _locale.GetBiomeName(tile.BiomeId), tile.Q, tile.R);
                _exitButton.text = _locale.Get("common.cancel");
                _root.style.display = DisplayStyle.Flex;
            }
            else
            {
                _root.style.display = DisplayStyle.None;
            }
        }

        void OnExit() => _appState.RequestExitToWorld();

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}
