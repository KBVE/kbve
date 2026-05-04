#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Phase 1 multiplayer lobby waiting room. Visible during <see cref="AppInterfaceState.Lobby"/>; shows lobby id (host can copy + share via Steam invite), peer count, mode, and a Start Match button gated to the host. No avatars / per-member rows yet — keeps Phase 1 tight on plumbing; Phase 2 layers richer presence on top.</summary>
    public sealed class UILobbyRoom : IAsyncStartable, IDisposable
    {
        readonly AppStateController _appState;
        readonly MultiplayerCoordinator _mp;
        readonly UIPanelManager _panelManager;
        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        Label _title;
        Label _modeLabel;
        Label _seedLabel;
        Label _membersLabel;
        Label _lobbyIdLabel;
        Button _startBtn;
        Button _leaveBtn;

        [Inject]
        public UILobbyRoom(AppStateController appState, MultiplayerCoordinator mp, UIPanelManager panelManager)
        {
            _appState = appState;
            _mp = mp;
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

            BuildPanel(uiDoc.rootVisualElement);

            _appState.Current
                .Subscribe(state => SetVisible(state == AppInterfaceState.Lobby))
                .AddTo(_disposables);

            _mp.Mode.Subscribe(m => _modeLabel.text = $"Mode: {m}").AddTo(_disposables);
            _mp.IsHost.Subscribe(h => _startBtn.SetEnabled(h)).AddTo(_disposables);
            _mp.Members.Subscribe(n => _membersLabel.text = $"Members: {n}").AddTo(_disposables);
        }

        void BuildPanel(VisualElement uiRoot)
        {
            _root = new VisualElement();
            _root.style.position = Position.Absolute;
            _root.style.left = 0;
            _root.style.right = 0;
            _root.style.top = 0;
            _root.style.bottom = 0;
            _root.style.alignItems = Align.Center;
            _root.style.justifyContent = Justify.Center;
            _root.style.backgroundColor = UIStyles.Palette.BackdropDim;
            _root.style.display = DisplayStyle.None;

            var card = new VisualElement().ApplyPanelChrome(padV: 24, padH: 32);
            card.style.minWidth = 380;
            card.style.alignItems = Align.Stretch;

            _title = UIStyles.MakeHeading("Lobby", fontSize: 22);
            _title.style.unityTextAlign = UnityEngine.TextAnchor.MiddleCenter;
            _title.style.marginBottom = 12;

            _modeLabel    = MakeRow("Mode: -");
            _membersLabel = MakeRow("Members: 0");
            _seedLabel    = MakeRow("Seed: -");
            _lobbyIdLabel = MakeRow("Lobby: -");

            _startBtn = new Button(() => _mp.StartMatch()) { text = "Start Match" };
            _startBtn.style.marginTop = 16;
            _startBtn.style.paddingTop = 8;
            _startBtn.style.paddingBottom = 8;
            _startBtn.style.color = UIStyles.Palette.GoldBright;
            _startBtn.style.backgroundColor = UIStyles.Palette.ButtonBg;

            _leaveBtn = new Button(() => _mp.Leave()) { text = "Leave Lobby" };
            _leaveBtn.style.marginTop = 6;
            _leaveBtn.style.color = UIStyles.Palette.GoldMuted;
            _leaveBtn.style.backgroundColor = UIStyles.Palette.ButtonBg;

            card.Add(_title);
            card.Add(_modeLabel);
            card.Add(_membersLabel);
            card.Add(_seedLabel);
            card.Add(_lobbyIdLabel);
            card.Add(_startBtn);
            card.Add(_leaveBtn);
            _root.Add(card);
            uiRoot.Add(_root);
        }

        static Label MakeRow(string text)
        {
            var l = new Label(text);
            l.style.color = UIStyles.Palette.TextPrimary;
            l.style.fontSize = 13;
            l.style.marginBottom = 4;
            return l;
        }

        void SetVisible(bool visible)
        {
            if (_root == null) return;
            if (visible)
            {
                _seedLabel.text    = $"Seed: {(_mp.InLobby ? _mp.Mode.CurrentValue.ToString() : "-")}";
                _lobbyIdLabel.text = $"Lobby: {_mp.CurrentLobbyId}";
            }
            _root.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            if (visible) _root.BringToFront();
        }

        public void Dispose() => _disposables?.Dispose();
    }
}

#endif
