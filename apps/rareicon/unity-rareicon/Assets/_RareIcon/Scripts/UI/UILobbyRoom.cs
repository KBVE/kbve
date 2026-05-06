#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using ObservableCollections;
using R3;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Phase 1 multiplayer lobby waiting room. Visible during <see cref="AppInterfaceState.Lobby"/>; shows lobby id, peer roster (Steam display names + host marker), mode picker (host-only), invite-overlay button, Start, Leave. Mode + Start fan out via <see cref="MultiplayerCoordinator"/> which writes to Steam lobby data; clients see updates through <see cref="SteamLobbyDataChangedMessage"/> + <see cref="SteamLobbyMemberChangedMessage"/>. Member list is delta-driven via <see cref="ObservableListView{TRecord, TElement}"/> over <see cref="MultiplayerCoordinator.MemberList"/>; empty-state row is a permanent fixture toggled by display style on count-change. All strings i18n via <see cref="LocaleService"/>; row text uses <see cref="ZString"/> for zero-alloc formatting.</summary>
    public sealed class UILobbyRoom : IAsyncStartable, IDisposable
    {
        readonly AppStateController _appState;
        readonly MultiplayerCoordinator _mp;
        readonly UIPanelManager _panelManager;
        readonly LocaleService _locale;
        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        VisualElement _docRoot;
        VisualElement _titleContent;
        readonly List<VisualElement> _hiddenSiblings = new();
        VisualElementPool<Label> _memberRowPool;
        ObservableListView<MemberRecord, Label> _memberView;
        Label _emptyRow;
        readonly ReactiveProperty<bool> _isVisible = new(false);
        Label _modeLabel;
        Label _seedLabel;
        Label _lobbyIdLabel;
        VisualElement _memberList;
        Button _modePvEBtn;
        Button _modePvPBtn;
        Button _inviteBtn;
        Button _startBtn;
        Button _leaveBtn;

        string _hostSuffix;
        string _modeLabelPrefix;
        string _seedLabelPrefix;
        string _lobbyIdLabelPrefix;
        string _emptyDash;

        [Inject]
        public UILobbyRoom(AppStateController appState, MultiplayerCoordinator mp, UIPanelManager panelManager, LocaleService locale)
        {
            _appState = appState;
            _mp = mp;
            _panelManager = panelManager;
            _locale = locale;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            await UniTask.WaitUntil(() => _panelManager.IsRootReady, cancellationToken: cancellation);
            var uiRoot = _panelManager.RootElement;
            if (uiRoot == null) return;

            CacheLocalizedConstants();
            BuildPanel(uiRoot);

            _appState.Current
                .Subscribe(state => _isVisible.Value = state == AppInterfaceState.Lobby)
                .AddTo(_disposables);

            _isVisible.DistinctUntilChanged()
                .Subscribe(OnVisibilityChanged)
                .AddTo(_disposables);

            _mp.Mode
                .Where(_ => _isVisible.Value)
                .Subscribe(_ => RefreshModeUI())
                .AddTo(_disposables);

            _mp.IsHost
                .Where(_ => _isVisible.Value)
                .Subscribe(_ => RefreshHostUI())
                .AddTo(_disposables);

            _memberView = new ObservableListView<MemberRecord, Label>(
                source: _mp.MemberList,
                container: _memberList,
                pool: _memberRowPool,
                bind: BindMemberRow);

            _mp.MemberList.ObserveCountChanged()
                .Select(c => c == 0 ? DisplayStyle.Flex : DisplayStyle.None)
                .DistinctUntilChanged()
                .Subscribe(d => _emptyRow.style.display = d)
                .AddTo(_disposables);
        }

        void CacheLocalizedConstants()
        {
            _hostSuffix         = ZString.Concat("  ", _locale.Get("lobby.host_suffix"));
            _modeLabelPrefix    = _locale.Get("lobby.mode_label");
            _seedLabelPrefix    = _locale.Get("lobby.seed_label");
            _lobbyIdLabelPrefix = _locale.Get("lobby.id_label");
            _emptyDash          = _locale.Get("lobby.empty_dash");
        }

        void BindMemberRow(MemberRecord rec, Label row)
        {
            row.text = rec.DisplayLine.IsEmpty
                ? ZString.Concat("• ", rec.DisplayName.ToString(), rec.IsHost == 1 ? _hostSuffix : string.Empty)
                : rec.DisplayLine.ToString();
            row.style.color = UIStyles.Palette.TextPrimary;
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

            var title = UIStyles.MakeHeading(_locale.Get("lobby.title"), fontSize: 22);
            title.style.unityTextAlign = TextAnchor.MiddleCenter;
            title.style.marginBottom = 12;

            _modeLabel    = MakeRow(ZString.Concat(_modeLabelPrefix,    ": ", _emptyDash));
            _seedLabel    = MakeRow(ZString.Concat(_seedLabelPrefix,    ": ", _emptyDash));
            _lobbyIdLabel = MakeRow(ZString.Concat(_lobbyIdLabelPrefix, ": ", _emptyDash));

            var modeRow = new VisualElement();
            modeRow.style.flexDirection = FlexDirection.Row;
            modeRow.style.justifyContent = Justify.SpaceBetween;
            modeRow.style.marginTop = 6;

            _modePvEBtn = MakeModeBtn(_locale.Get("mode.btn_pve_coop"), () => _mp.SetMode(GameMode.PvECoop));
            _modePvPBtn = MakeModeBtn(_locale.Get("mode.btn_pvp"),      () => _mp.SetMode(GameMode.PvP));
            modeRow.Add(_modePvEBtn);
            modeRow.Add(_modePvPBtn);

            var membersHeader = MakeRow(_locale.Get("lobby.members_header"));
            membersHeader.style.marginTop = 12;
            membersHeader.style.color = UIStyles.Palette.GoldBright;
            membersHeader.style.unityFontStyleAndWeight = FontStyle.Bold;

            _memberList = new VisualElement();
            _memberList.style.marginTop = 4;
            _memberList.style.marginBottom = 8;
            _memberList.style.minHeight = 60;

            _memberRowPool = new VisualElementPool<Label>(
                factory: () =>
                {
                    var l = new Label();
                    l.style.color = UIStyles.Palette.TextPrimary;
                    l.style.fontSize = 12;
                    l.style.marginBottom = 2;
                    return l;
                },
                onRelease: l => l.text = string.Empty,
                prewarm: 4);

            _emptyRow = new Label(_locale.Get("lobby.waiting_for_peers"));
            _emptyRow.style.color = UIStyles.Palette.GoldMuted;
            _emptyRow.style.fontSize = 12;
            _emptyRow.style.marginBottom = 2;
            _memberList.Add(_emptyRow);

            _inviteBtn = MakeButton(_locale.Get("lobby.btn_invite"), () => _mp.OpenInviteOverlay());
            _inviteBtn.style.marginTop = 12;

            _startBtn = MakeButton(_locale.Get("lobby.btn_start"), () => _mp.StartMatch());
            _startBtn.style.marginTop = 6;

            _leaveBtn = MakeButton(_locale.Get("lobby.btn_leave"), () => _mp.Leave());
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

            _docRoot = uiRoot;
        }

        void EnsureMountedInTitleContent()
        {
            if (_root == null || _docRoot == null) return;
            if (_titleContent != null && _root.parent == _titleContent) return;

            if (_titleContent == null)
                _titleContent = _docRoot.Q<VisualElement>("title-content");
            if (_titleContent == null) return;

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

        void OnVisibilityChanged(bool visible)
        {
            if (_root == null) return;
            if (visible)
            {
                EnsureMountedInTitleContent();
                _seedLabel.text    = ZString.Concat(_seedLabelPrefix,    ": ", _mp.InLobby ? "0" : _emptyDash);
                _lobbyIdLabel.text = ZString.Concat(_lobbyIdLabelPrefix, ": ", _mp.CurrentLobbyId);
                HideTitleStageSiblings();
                RefreshModeUI();
                RefreshHostUI();
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
            _modeLabel.text = ZString.Concat(_modeLabelPrefix, ": ", DescribeMode(mode));
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

        string DescribeMode(GameMode m) => m switch
        {
            GameMode.PvECoop => _locale.Get("mode.pve_coop"),
            GameMode.PvP     => _locale.Get("mode.pvp"),
            _                => _locale.Get("mode.single_player"),
        };

        public void Dispose()
        {
            _memberView?.Dispose();
            _memberRowPool?.Dispose();
            _disposables?.Dispose();
        }
    }
}

#endif
