#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using MessagePipe;
using R3;
using RareIcon.Platform;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Phase 1 multiplayer orchestrator — sits between <see cref="ISteamLobbyService"/> (Steam transport) and the game flow (<see cref="WorldGenSession"/> + <see cref="AppStateController"/>). Host creates a lobby + stamps mode/seed/started lobby data; clients read those keys + transition to WorldGen when started flips. No gameplay sync yet — pure plumbing for the lobby flow. Phase 2 layers ECS replication on top of this once peers are confirmed in the same world.</summary>
    public sealed class MultiplayerCoordinator : IStartable, IDisposable
    {
        readonly ISteamLobbyService _lobby;
        readonly WorldGenSession _session;
        readonly AppStateController _appState;

        readonly ISubscriber<SteamLobbyCreatedMessage>       _subCreated;
        readonly ISubscriber<SteamLobbyJoinedMessage>        _subJoined;
        readonly ISubscriber<SteamLobbyLeftMessage>          _subLeft;
        readonly ISubscriber<SteamLobbyMemberChangedMessage> _subMember;
        readonly ISubscriber<SteamLobbyDataChangedMessage>   _subData;

        readonly ReactiveProperty<GameMode> _mode    = new(GameMode.SinglePlayer);
        readonly ReactiveProperty<bool>     _isHost  = new(false);
        readonly ReactiveProperty<int>      _members = new(0);

        readonly CompositeDisposable _disposables = new();
        bool _matchStarting;

        public ReadOnlyReactiveProperty<GameMode> Mode    => _mode;
        public ReadOnlyReactiveProperty<bool>     IsHost  => _isHost;
        public ReadOnlyReactiveProperty<int>      Members => _members;

        public ulong CurrentLobbyId => _lobby.CurrentLobbyId;
        public bool  InLobby        => _lobby.InLobby;

        [Inject]
        public MultiplayerCoordinator(
            ISteamLobbyService lobby,
            WorldGenSession session,
            AppStateController appState,
            ISubscriber<SteamLobbyCreatedMessage>       subCreated,
            ISubscriber<SteamLobbyJoinedMessage>        subJoined,
            ISubscriber<SteamLobbyLeftMessage>          subLeft,
            ISubscriber<SteamLobbyMemberChangedMessage> subMember,
            ISubscriber<SteamLobbyDataChangedMessage>   subData)
        {
            _lobby      = lobby;
            _session    = session;
            _appState   = appState;
            _subCreated = subCreated;
            _subJoined  = subJoined;
            _subLeft    = subLeft;
            _subMember  = subMember;
            _subData    = subData;
        }

        public void Start()
        {
            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _subCreated.Subscribe(OnCreated).AddTo(bag);
            _subJoined.Subscribe(OnJoined).AddTo(bag);
            _subLeft.Subscribe(OnLeft).AddTo(bag);
            _subMember.Subscribe(OnMember).AddTo(bag);
            _subData.Subscribe(OnData).AddTo(bag);
            _disposables.Add(bag.Build());
        }

        public void Dispose() => _disposables?.Dispose();

        // -- Public host / join API --

        /// <summary>Host a PvE co-op match. Lobby is friends-only by default; pass any int seed (or null to roll). Auto-transitions UI to <see cref="AppInterfaceState.Lobby"/> on success.</summary>
        public void HostPvECoop(int? seed = null) => Host(GameMode.PvECoop, seed);

        /// <summary>Host a PvP match — same lobby plumbing, different mode flag. Phase 3 picks up the per-peer faction split.</summary>
        public void HostPvP(int? seed = null) => Host(GameMode.PvP, seed);

        /// <summary>Host the chosen mode + lobby visibility. Stamps mode + seed onto the lobby on creation so joiners read them in <see cref="OnJoined"/>.</summary>
        public void Host(GameMode mode, int? seed = null, SteamLobbyVisibility visibility = SteamLobbyVisibility.FriendsOnly, int maxMembers = 4)
        {
            int chosenSeed = seed ?? unchecked((int)DateTime.UtcNow.Ticks);
            _mode.Value = mode;
            _session.SetSeed(chosenSeed);
            _isHost.Value = true;
            _matchStarting = false;
            _lobby.CreateLobby(visibility, maxMembers);
        }

        /// <summary>Join a friend's lobby by id (passed via Steam invite or rich-presence).</summary>
        public void Join(ulong lobbyId)
        {
            _isHost.Value = false;
            _matchStarting = false;
            _lobby.Join(lobbyId);
        }

        /// <summary>Open the active Steam invite overlay so the host can drag friends in.</summary>
        public void Invite(ulong friendSteamId) => _lobby.Invite(friendSteamId);

        /// <summary>Leave the current lobby and bounce UI back to the title.</summary>
        public void Leave()
        {
            _lobby.Leave();
            _matchStarting = false;
            _isHost.Value = false;
        }

        /// <summary>Host-only — flip the started flag so every peer transitions to WorldGen. No-op if already started or not the host.</summary>
        public void StartMatch()
        {
            if (!_isHost.Value || !_lobby.InLobby || _matchStarting) return;
            _lobby.SetData(LobbyDataKeys.Mode,    ((byte)_mode.Value).ToString());
            _lobby.SetData(LobbyDataKeys.Seed,    _session.Seed.CurrentValue.ToString());
            _lobby.SetData(LobbyDataKeys.Started, "1");
            // Self-transition still flows through OnData when Steam echoes.
        }

        // -- Steam callbacks --

        void OnCreated(SteamLobbyCreatedMessage msg)
        {
            if (!msg.Success) return;
            _lobby.SetData(LobbyDataKeys.Mode,    ((byte)_mode.Value).ToString());
            _lobby.SetData(LobbyDataKeys.Seed,    _session.Seed.CurrentValue.ToString());
            _lobby.SetData(LobbyDataKeys.Started, "0");
            _appState.EnterLobby();
        }

        void OnJoined(SteamLobbyJoinedMessage msg)
        {
            if (!msg.Success) return;
            _members.Value = _lobby.Members.Count;

            string modeStr = _lobby.GetData(LobbyDataKeys.Mode);
            if (byte.TryParse(modeStr, out byte b) && b <= (byte)GameMode.PvP)
                _mode.Value = (GameMode)b;

            string seedStr = _lobby.GetData(LobbyDataKeys.Seed);
            if (int.TryParse(seedStr, out int seed))
                _session.SetSeed(seed);

            _appState.EnterLobby();

            // If we joined late while the match is already running, jump
            // straight into world gen instead of sitting in the lobby UI.
            if (_lobby.GetData(LobbyDataKeys.Started) == "1")
                BeginRun();
        }

        void OnLeft(SteamLobbyLeftMessage _)
        {
            _members.Value = 0;
            _isHost.Value  = false;
            _matchStarting = false;
            _appState.ReturnToMainMenu();
        }

        void OnMember(SteamLobbyMemberChangedMessage _)
        {
            _members.Value = _lobby.Members.Count;
        }

        void OnData(SteamLobbyDataChangedMessage _)
        {
            // Started flag is the only field that auto-triggers a state
            // transition; mode + seed updates are read on demand when the
            // host clicks Start.
            if (_matchStarting) return;
            if (_lobby.GetData(LobbyDataKeys.Started) != "1") return;

            string seedStr = _lobby.GetData(LobbyDataKeys.Seed);
            if (int.TryParse(seedStr, out int seed))
                _session.SetSeed(seed);

            string modeStr = _lobby.GetData(LobbyDataKeys.Mode);
            if (byte.TryParse(modeStr, out byte b) && b <= (byte)GameMode.PvP)
                _mode.Value = (GameMode)b;

            BeginRun();
        }

        void BeginRun()
        {
            _matchStarting = true;
            _session.BeginGeneration();
        }
    }
}

#endif
