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

            _root = new VisualElement().ApplyPanelChrome(
                background: UIStyles.Palette.TileHudBg,
                padV: 8, padH: 14);
            _root.style.AnchorTopLeft();
            _root.style.flexDirection = FlexDirection.Row;
            _root.style.alignItems = Align.Center;
            _root.style.display = DisplayStyle.None;

            _tileLabel = UIStyles.MakeHeading("", fontSize: 16);
            _tileLabel.style.marginRight = 12;

            _exitButton = UIStyles.MakeButton("Exit", OnExit);
            _exitButton.style.height = 28;
            _exitButton.style.fontSize = 13;
            _exitButton.style.BorderColor(UIStyles.Palette.Alert);
            _exitButton.style.color = UIStyles.Palette.Alert;

            _root.Add(_tileLabel);
            _root.Add(_exitButton);
            root.Add(_root);
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
