
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using MessagePipe;
using Steamworks;
using VContainer.Unity;

namespace RareIcon.Platform
{
    public interface ISteamPresenceService
    {
        void SetStatus(string status);
        void SetLobbyConnect(ulong lobbyId);
        void ClearLobbyConnect();
        void ClearAll();
    }

    public sealed class SteamPresenceService : ISteamPresenceService, IStartable, IDisposable
    {
        readonly ISubscriber<SteamLobbyJoinedMessage> _joined;
        readonly ISubscriber<SteamLobbyLeftMessage>   _left;
        IDisposable _joinSub;
        IDisposable _leftSub;

        public SteamPresenceService(
            ISubscriber<SteamLobbyJoinedMessage> joined,
            ISubscriber<SteamLobbyLeftMessage>   left)
        {
            _joined = joined;
            _left   = left;
        }

        public void Start()
        {
            if (!SteamManager.IsReady) return;
            _joinSub = _joined.Subscribe(m =>
            {
                if (m.Success) SetLobbyConnect(m.LobbyId);
            });
            _leftSub = _left.Subscribe(_ => ClearLobbyConnect());
        }

        public void Dispose()
        {
            _joinSub?.Dispose();
            _leftSub?.Dispose();
            if (SteamManager.IsReady) ClearAll();
        }

        public void SetStatus(string status)
        {
            if (!SteamManager.IsReady) return;
            SteamFriends.SetRichPresence("status", status ?? string.Empty);

            SteamFriends.SetRichPresence("steam_display", "#StatusGeneric");
        }

        public void SetLobbyConnect(ulong lobbyId)
        {
            if (!SteamManager.IsReady) return;
            SteamFriends.SetRichPresence("connect", $"+connect_lobby {lobbyId}");
        }

        public void ClearLobbyConnect()
        {
            if (!SteamManager.IsReady) return;
            SteamFriends.SetRichPresence("connect", string.Empty);
        }

        public void ClearAll()
        {
            if (!SteamManager.IsReady) return;
            SteamFriends.ClearRichPresence();
        }
    }
}

#else

namespace RareIcon.Platform
{
    public interface ISteamPresenceService
    {
        void SetStatus(string status);
        void SetLobbyConnect(ulong lobbyId);
        void ClearLobbyConnect();
        void ClearAll();
    }

    public sealed class SteamPresenceService : ISteamPresenceService
    {
        public void SetStatus(string status) { }
        public void SetLobbyConnect(ulong lobbyId) { }
        public void ClearLobbyConnect() { }
        public void ClearAll() { }
    }
}

#endif
