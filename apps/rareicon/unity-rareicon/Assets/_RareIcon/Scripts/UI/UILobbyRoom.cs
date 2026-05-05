#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Phase 1 multiplayer lobby waiting room. Visible during <see cref="AppInterfaceState.Lobby"/>; shows lobby id, peer roster (Steam display names + host marker), mode picker (host-only), invite-overlay button, Start, Leave. Mode + Start fan out via <see cref="MultiplayerCoordinator"/> which writes to Steam lobby data; clients see updates through <see cref="SteamLobbyDataChangedMessage"/> + <see cref="SteamLobbyMemberChangedMessage"/>.</summary>
    public sealed class UILobbyRoom : IAsyncStartable, IDisposable
    {
        readonly AppStateController _appState;
        readonly MultiplayerCoordinator _mp;
        readonly UIPanelManager _panelManager;
        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        VisualElement _docRoot;
        VisualElement _titleContent;
        readonly System.Collections.Generic.List<VisualElement> _hiddenSiblings = new();
        Label _modeLabel;
        Label _seedLabel;
        Label _lobbyIdLabel;
        VisualElement _memberList;
        Button _modePvEBtn;
        Button _modePvPBtn;
        Button _inviteBtn;
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
            VisualElement uiRoot;
            try { uiRoot = await _panelManager.WaitForRootAsync(cancellation); }
            catch (OperationCanceledException) { return; }
            if (uiRoot == null) return;

            BuildPanel(uiRoot);

            _appState.Current
                .Subscribe(state => SetVisible(state == AppInterfaceState.Lobby))
                .AddTo(_disposables);

            _mp.Mode.Subscribe(_ => RefreshModeUI()).AddTo(_disposables);
            _mp.IsHost.Subscribe(_ => RefreshHostUI()).AddTo(_disposables);
            _mp.Members.Subscribe(_ => RefreshMemberList()).AddTo(_disposables);
        }

        void BuildPanel(VisualElement uiRoot)
        {
            _root = new VisualElement();
            _root.style.flexGrow = 1;
            _root.style.alignItems = Align.Center;
            _root.style.justifyContent = Justify.FlexStart;
            _root.style.paddingTop = 24;
            _root.style.display = DisplayStyle.None;
            _root.AddToClassList("title-stage");

            var card = new VisualElement().ApplyPanelChrome(padV: 24, padH: 32);
            card.style.minWidth = 420;
            card.style.alignItems = Align.Stretch;

            var title = UIStyles.MakeHeading("Lobby", fontSize: 22);
            title.style.unityTextAlign = TextAnchor.MiddleCenter;
            title.style.marginBottom = 12;

            _modeLabel    = MakeRow("Mode: -");
            _seedLabel    = MakeRow("Seed: -");
            _lobbyIdLabel = MakeRow("Lobby: -");

            // Mode picker (host-only, disabled for clients)
            var modeRow = new VisualElement();
            modeRow.style.flexDirection = FlexDirection.Row;
            modeRow.style.justifyContent = Justify.SpaceBetween;
            modeRow.style.marginTop = 6;

            _modePvEBtn = MakeModeBtn("PvE Co-op",  () => _mp.SetMode(GameMode.PvECoop));
            _modePvPBtn = MakeModeBtn("PvP",        () => _mp.SetMode(GameMode.PvP));
            modeRow.Add(_modePvEBtn);
            modeRow.Add(_modePvPBtn);

            // Member list
            var membersHeader = MakeRow("Members");
            membersHeader.style.marginTop = 12;
            membersHeader.style.color = UIStyles.Palette.GoldBright;
            membersHeader.style.unityFontStyleAndWeight = FontStyle.Bold;

            _memberList = new VisualElement();
            _memberList.style.marginTop = 4;
            _memberList.style.marginBottom = 8;
            _memberList.style.minHeight = 60;

            // Action buttons
            _inviteBtn = MakeButton("Invite Friends", () => _mp.OpenInviteOverlay());
            _inviteBtn.style.marginTop = 12;

            _startBtn = MakeButton("Start Match", () => _mp.StartMatch());
            _startBtn.style.marginTop = 6;

            _leaveBtn = MakeButton("Leave Lobby", () => _mp.Leave());
            _leaveBtn.style.marginTop = 6;
            _leaveBtn.style.color = UIStyles.Palette.GoldMuted;

            card.Add(title);
            card.Add(_modeLabel);
            card.Add(_seedLabel);
            card.Add(_lobbyIdLabel);
            card.Add(modeRow);
            card.Add(membersHeader);
            card.Add(_memberList);
            card.Add(_inviteBtn);
            card.Add(_startBtn);
            card.Add(_leaveBtn);
            _root.Add(card);

            // Defer parenting to SetVisible — title screen UXML is loaded
            // by UITitleScreen on its own IAsyncStartable schedule which may
            // not have run yet when this builder fires. Lazy-find the
            // title-content scrollview at show time.
            _docRoot = uiRoot;
        }

        void EnsureMountedInTitleContent()
        {
            if (_root == null || _docRoot == null) return;
            var found = _docRoot.Q<VisualElement>("title-content");
            if (found == null) return;
            if (_titleContent == found && _root.parent == found) return;

            _titleContent = found;
            _root.RemoveFromHierarchy();
            _titleContent.Add(_root);
        }

        static Label MakeRow(string text)
        {
            var l = new Label(text);
            l.style.color = UIStyles.Palette.TextPrimary;
            l.style.fontSize = 13;
            l.style.marginBottom = 4;
            return l;
        }

        static Button MakeButton(string text, Action onClick)
        {
            var b = new Button(onClick) { text = text };
            b.style.paddingTop = 6;
            b.style.paddingBottom = 6;
            b.style.color = UIStyles.Palette.GoldBright;
            b.style.backgroundColor = UIStyles.Palette.ButtonBg;
            return b;
        }

        static Button MakeModeBtn(string text, Action onClick)
        {
            var b = MakeButton(text, onClick);
            b.style.flexGrow = 1;
            b.style.marginLeft = 2;
            b.style.marginRight = 2;
            return b;
        }

        void SetVisible(bool visible)
        {
            if (_root == null) return;
            if (visible)
            {
                EnsureMountedInTitleContent();
                _seedLabel.text    = $"Seed: {(_mp.InLobby ? Convert.ToString(0) : "-")}";
                _lobbyIdLabel.text = $"Lobby: {_mp.CurrentLobbyId}";
                HideTitleStageSiblings();
                RefreshModeUI();
                RefreshHostUI();
                RefreshMemberList();
            }
            else
            {
                RestoreTitleStageSiblings();
            }
            _root.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            if (visible) _root.BringToFront();
        }

        void HideTitleStageSiblings()
        {
            _hiddenSiblings.Clear();
            if (_titleContent == null) return;
            for (int i = 0; i < _titleContent.childCount; i++)
            {
                var child = _titleContent[i];
                if (child == _root) continue;
                if (!child.ClassListContains("title-stage")) continue;
                if (child.style.display == DisplayStyle.None) continue;
                _hiddenSiblings.Add(child);
                child.style.display = DisplayStyle.None;
            }
        }

        void RestoreTitleStageSiblings()
        {
            for (int i = 0; i < _hiddenSiblings.Count; i++)
                _hiddenSiblings[i].style.display = DisplayStyle.Flex;
            _hiddenSiblings.Clear();
        }

        void RefreshModeUI()
        {
            var mode = _mp.Mode.CurrentValue;
            _modeLabel.text = $"Mode: {DescribeMode(mode)}";
            HighlightModeBtn(_modePvEBtn, mode == GameMode.PvECoop);
            HighlightModeBtn(_modePvPBtn, mode == GameMode.PvP);
        }

        void RefreshHostUI()
        {
            bool host = _mp.IsHost.CurrentValue;
            _modePvEBtn.SetEnabled(host);
            _modePvPBtn.SetEnabled(host);
            _startBtn.SetEnabled(host);
            _inviteBtn.SetEnabled(host);
        }

        void RefreshMemberList()
        {
            if (_memberList == null) return;
            _memberList.Clear();

            var ids = _mp.MemberIds;
            ulong owner = _mp.OwnerSteamId;
            for (int i = 0; i < ids.Count; i++)
            {
                ulong id = ids[i];
                string name = MultiplayerCoordinator.ResolveDisplayName(id);
                string suffix = id == owner ? "  (host)" : string.Empty;

                var row = new Label($"• {name}{suffix}");
                row.style.color = UIStyles.Palette.TextPrimary;
                row.style.fontSize = 12;
                row.style.marginBottom = 2;
                _memberList.Add(row);
            }

            if (ids.Count == 0)
            {
                var empty = new Label("waiting for peers…");
                empty.style.color = UIStyles.Palette.GoldMuted;
                empty.style.fontSize = 12;
                _memberList.Add(empty);
            }
        }

        static void HighlightModeBtn(Button b, bool active)
        {
            b.style.borderTopWidth = 1;
            b.style.borderBottomWidth = 1;
            b.style.borderLeftWidth = 1;
            b.style.borderRightWidth = 1;
            var c = active ? UIStyles.Palette.Gold : UIStyles.Palette.BorderSubtle;
            b.style.borderTopColor = c;
            b.style.borderBottomColor = c;
            b.style.borderLeftColor = c;
            b.style.borderRightColor = c;
        }

        static string DescribeMode(GameMode m) => m switch
        {
            GameMode.PvECoop => "PvE Co-op (shared empire)",
            GameMode.PvP     => "PvP (rival empires)",
            _                => "Single Player",
        };

        public void Dispose() => _disposables?.Dispose();
    }
}

#endif
