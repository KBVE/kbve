// Steam lobby operations: create, join, leave, browse, metadata, overlay
// invite. Listener attaches to the lobby-related Steam callbacks and
// bridges them through MessagePipe so game code never touches Steamworks
// types directly.
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using System.Collections.Generic;
using MessagePipe;
using Steamworks;
using UnityEngine;
using VContainer.Unity;

namespace RareIcon.Platform
{
    /// <summary>Access type for <see cref="ISteamLobbyService.CreateLobby"/> — mirrors Steam's ELobbyType.</summary>
    public enum SteamLobbyVisibility : byte
    {
        Private       = 0,
        FriendsOnly   = 1,
        Public        = 2,
        Invisible     = 3,
    }

    public interface ISteamLobbyService
    {
        ulong CurrentLobbyId { get; }
        bool InLobby { get; }
        void CreateLobby(SteamLobbyVisibility visibility, int maxMembers);
        void Join(ulong lobbyId);
        void Leave();
        void Invite(ulong friendSteamId);
        void SetData(string key, string value);
        void SetMemberData(string key, string value);
        string GetData(string key);
        string GetMemberData(ulong steamId, string key);
        IReadOnlyList<ulong> Members { get; }
        ulong OwnerSteamId { get; }
    }

    public sealed class SteamLobbyService : ISteamLobbyService, IStartable, IDisposable
    {
        readonly IPublisher<SteamLobbyCreatedMessage>       _pubCreated;
        readonly IPublisher<SteamLobbyJoinedMessage>        _pubJoined;
        readonly IPublisher<SteamLobbyLeftMessage>          _pubLeft;
        readonly IPublisher<SteamLobbyMemberChangedMessage> _pubMember;
        readonly IPublisher<SteamLobbyInviteMessage>        _pubInvite;
        readonly IPublisher<SteamJoinRequestedMessage>      _pubJoinReq;
        readonly IPublisher<SteamLobbyDataChangedMessage>   _pubDataChanged;

        Callback<LobbyCreated_t>                 _cbCreated;
        Callback<LobbyEnter_t>                   _cbEnter;
        Callback<LobbyChatUpdate_t>              _cbMember;
        Callback<LobbyDataUpdate_t>              _cbData;
        Callback<LobbyInvite_t>                  _cbInvite;
        Callback<GameLobbyJoinRequested_t>       _cbJoinReq;
        Callback<GameRichPresenceJoinRequested_t> _cbRpJoinReq;

        CSteamID _currentLobby = CSteamID.Nil;
        readonly List<ulong> _members = new();

        public ulong CurrentLobbyId => _currentLobby.m_SteamID;
        public bool  InLobby        => _currentLobby != CSteamID.Nil;
        public IReadOnlyList<ulong> Members => _members;
        public ulong OwnerSteamId =>
            InLobby ? SteamMatchmaking.GetLobbyOwner(_currentLobby).m_SteamID : 0UL;

        public SteamLobbyService(
            IPublisher<SteamLobbyCreatedMessage>       pubCreated,
            IPublisher<SteamLobbyJoinedMessage>        pubJoined,
            IPublisher<SteamLobbyLeftMessage>          pubLeft,
            IPublisher<SteamLobbyMemberChangedMessage> pubMember,
            IPublisher<SteamLobbyInviteMessage>        pubInvite,
            IPublisher<SteamJoinRequestedMessage>      pubJoinReq,
            IPublisher<SteamLobbyDataChangedMessage>   pubDataChanged)
        {
            _pubCreated     = pubCreated;
            _pubJoined      = pubJoined;
            _pubLeft        = pubLeft;
            _pubMember      = pubMember;
            _pubInvite      = pubInvite;
            _pubJoinReq     = pubJoinReq;
            _pubDataChanged = pubDataChanged;
        }

        public void Start()
        {
            if (!SteamManager.IsReady) return;
            _cbCreated   = Callback<LobbyCreated_t>.Create(OnCreated);
            _cbEnter     = Callback<LobbyEnter_t>.Create(OnEnter);
            _cbMember    = Callback<LobbyChatUpdate_t>.Create(OnMember);
            _cbData      = Callback<LobbyDataUpdate_t>.Create(OnData);
            _cbInvite    = Callback<LobbyInvite_t>.Create(OnInvite);
            _cbJoinReq   = Callback<GameLobbyJoinRequested_t>.Create(OnJoinReq);
            _cbRpJoinReq = Callback<GameRichPresenceJoinRequested_t>.Create(OnRpJoinReq);
        }

        public void Dispose()
        {
            _cbCreated?.Dispose();
            _cbEnter?.Dispose();
            _cbMember?.Dispose();
            _cbData?.Dispose();
            _cbInvite?.Dispose();
            _cbJoinReq?.Dispose();
            _cbRpJoinReq?.Dispose();
            if (InLobby) Leave();
        }

        public void CreateLobby(SteamLobbyVisibility visibility, int maxMembers)
        {
            if (!SteamManager.IsReady) return;
            SteamMatchmaking.CreateLobby((ELobbyType)visibility, Mathf.Clamp(maxMembers, 2, 250));
        }

        public void Join(ulong lobbyId)
        {
            if (!SteamManager.IsReady) return;
            SteamMatchmaking.JoinLobby(new CSteamID(lobbyId));
        }

        public void Leave()
        {
            if (!SteamManager.IsReady || !InLobby) return;
            var leaving = _currentLobby;
            SteamMatchmaking.LeaveLobby(leaving);
            _currentLobby = CSteamID.Nil;
            _members.Clear();
            _pubLeft.Publish(new SteamLobbyLeftMessage(leaving.m_SteamID));
        }

        public void Invite(ulong friendSteamId)
        {
            if (!SteamManager.IsReady || !InLobby) return;
            SteamMatchmaking.InviteUserToLobby(_currentLobby, new CSteamID(friendSteamId));
        }

        public void SetData(string key, string value)
        {
            if (!SteamManager.IsReady || !InLobby) return;
            SteamMatchmaking.SetLobbyData(_currentLobby, key, value);
        }

        public void SetMemberData(string key, string value)
        {
            if (!SteamManager.IsReady || !InLobby) return;
            SteamMatchmaking.SetLobbyMemberData(_currentLobby, key, value);
        }

        public string GetData(string key)
        {
            if (!SteamManager.IsReady || !InLobby) return string.Empty;
            return SteamMatchmaking.GetLobbyData(_currentLobby, key) ?? string.Empty;
        }

        public string GetMemberData(ulong steamId, string key)
        {
            if (!SteamManager.IsReady || !InLobby) return string.Empty;
            return SteamMatchmaking.GetLobbyMemberData(_currentLobby, new CSteamID(steamId), key) ?? string.Empty;
        }

        // --- Callbacks ---

        void OnCreated(LobbyCreated_t evt)
        {
            bool success = evt.m_eResult == EResult.k_EResultOK;
            ulong id = evt.m_ulSteamIDLobby;
            _pubCreated.Publish(new SteamLobbyCreatedMessage(id, success));
            // LobbyEnter_t fires separately right after on success.
        }

        void OnEnter(LobbyEnter_t evt)
        {
            ulong id = evt.m_ulSteamIDLobby;
            bool blocked = evt.m_EChatRoomEnterResponse != (uint)EChatRoomEnterResponse.k_EChatRoomEnterResponseSuccess;
            if (blocked)
            {
                _pubJoined.Publish(new SteamLobbyJoinedMessage(id, false));
                return;
            }
            _currentLobby = new CSteamID(id);
            RefreshMembers();
            _pubJoined.Publish(new SteamLobbyJoinedMessage(id, true));
        }

        void OnMember(LobbyChatUpdate_t evt)
        {
            if (evt.m_ulSteamIDLobby != _currentLobby.m_SteamID) return;
            var kind = MapMemberEvent((EChatMemberStateChange)evt.m_rgfChatMemberStateChange);
            _pubMember.Publish(new SteamLobbyMemberChangedMessage(
                evt.m_ulSteamIDLobby, evt.m_ulSteamIDUserChanged, kind));
            RefreshMembers();
        }

        void OnData(LobbyDataUpdate_t evt) =>
            _pubDataChanged.Publish(new SteamLobbyDataChangedMessage(
                evt.m_ulSteamIDLobby,
                evt.m_ulSteamIDLobby == evt.m_ulSteamIDMember ? 0UL : evt.m_ulSteamIDMember));

        void OnInvite(LobbyInvite_t evt) =>
            _pubInvite.Publish(new SteamLobbyInviteMessage(evt.m_ulSteamIDLobby, evt.m_ulSteamIDUser));

        void OnJoinReq(GameLobbyJoinRequested_t evt)
        {
            _pubJoinReq.Publish(new SteamJoinRequestedMessage(
                evt.m_steamIDLobby.m_SteamID, evt.m_steamIDFriend.m_SteamID));
            // Auto-join — the overlay's "Join Game" button is a commitment.
            Join(evt.m_steamIDLobby.m_SteamID);
        }

        void OnRpJoinReq(GameRichPresenceJoinRequested_t evt)
        {
            // The connect-string schema is "+connect_lobby <lobby_id>" — set
            // by SteamPresenceService when the local user hosts.
            if (string.IsNullOrEmpty(evt.m_rgchConnect)) return;
            if (!TryParseConnectLobby(evt.m_rgchConnect, out var lobbyId)) return;
            _pubJoinReq.Publish(new SteamJoinRequestedMessage(lobbyId, evt.m_steamIDFriend.m_SteamID));
            Join(lobbyId);
        }

        void RefreshMembers()
        {
            _members.Clear();
            if (!InLobby) return;
            int n = SteamMatchmaking.GetNumLobbyMembers(_currentLobby);
            for (int i = 0; i < n; i++)
                _members.Add(SteamMatchmaking.GetLobbyMemberByIndex(_currentLobby, i).m_SteamID);
        }

        static SteamLobbyMemberEvent MapMemberEvent(EChatMemberStateChange e)
        {
            if ((e & EChatMemberStateChange.k_EChatMemberStateChangeEntered)    != 0) return SteamLobbyMemberEvent.Entered;
            if ((e & EChatMemberStateChange.k_EChatMemberStateChangeLeft)       != 0) return SteamLobbyMemberEvent.Left;
            if ((e & EChatMemberStateChange.k_EChatMemberStateChangeDisconnected) != 0) return SteamLobbyMemberEvent.Disconnect;
            if ((e & EChatMemberStateChange.k_EChatMemberStateChangeKicked)     != 0) return SteamLobbyMemberEvent.Kicked;
            if ((e & EChatMemberStateChange.k_EChatMemberStateChangeBanned)     != 0) return SteamLobbyMemberEvent.Banned;
            return SteamLobbyMemberEvent.Unknown;
        }

        static bool TryParseConnectLobby(string connectString, out ulong lobbyId)
        {
            lobbyId = 0;
            const string tag = "+connect_lobby ";
            int idx = connectString.IndexOf(tag, StringComparison.Ordinal);
            if (idx < 0) return false;
            var tail = connectString.Substring(idx + tag.Length).Trim();
            int space = tail.IndexOf(' ');
            if (space > 0) tail = tail.Substring(0, space);
            return ulong.TryParse(tail, out lobbyId);
        }
    }
}

#else

using System.Collections.Generic;

namespace RareIcon.Platform
{
    public enum SteamLobbyVisibility : byte { Private, FriendsOnly, Public, Invisible }

    public interface ISteamLobbyService
    {
        ulong CurrentLobbyId { get; }
        bool InLobby { get; }
        void CreateLobby(SteamLobbyVisibility visibility, int maxMembers);
        void Join(ulong lobbyId);
        void Leave();
        void Invite(ulong friendSteamId);
        void SetData(string key, string value);
        void SetMemberData(string key, string value);
        string GetData(string key);
        string GetMemberData(ulong steamId, string key);
        IReadOnlyList<ulong> Members { get; }
        ulong OwnerSteamId { get; }
    }

    public sealed class SteamLobbyService : ISteamLobbyService
    {
        static readonly IReadOnlyList<ulong> _empty = new List<ulong>();
        public ulong CurrentLobbyId => 0UL;
        public bool InLobby => false;
        public IReadOnlyList<ulong> Members => _empty;
        public ulong OwnerSteamId => 0UL;
        public void CreateLobby(SteamLobbyVisibility visibility, int maxMembers) { }
        public void Join(ulong lobbyId) { }
        public void Leave() { }
        public void Invite(ulong friendSteamId) { }
        public void SetData(string key, string value) { }
        public void SetMemberData(string key, string value) { }
        public string GetData(string key) => string.Empty;
        public string GetMemberData(ulong steamId, string key) => string.Empty;
    }
}

#endif
