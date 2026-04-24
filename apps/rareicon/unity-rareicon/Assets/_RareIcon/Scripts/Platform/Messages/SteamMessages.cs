namespace RareIcon.Platform
{
    /// <summary>Lobby member transition kinds mirrored from Steam's EChatMemberStateChange bitmask — kept as an enum so game code + UI don't have to ifdef on Steamworks types.</summary>
    public enum SteamLobbyMemberEvent : byte
    {
        Unknown    = 0,
        Entered    = 1,
        Left       = 2,
        Disconnect = 3,
        Kicked     = 4,
        Banned     = 5,
    }

    /// <summary>Fires when a CreateLobby request resolves. Success = false means Steam rejected (overloaded / no client / banned). LobbyId is 0 on failure.</summary>
    public readonly struct SteamLobbyCreatedMessage
    {
        public readonly ulong LobbyId;
        public readonly bool  Success;
        public SteamLobbyCreatedMessage(ulong lobbyId, bool success) { LobbyId = lobbyId; Success = success; }
    }

    /// <summary>Fires when a JoinLobby request resolves (either via lobby browser, direct ID, or overlay invite). Success = false on denied / full / doesn't exist / banned.</summary>
    public readonly struct SteamLobbyJoinedMessage
    {
        public readonly ulong LobbyId;
        public readonly bool  Success;
        public SteamLobbyJoinedMessage(ulong lobbyId, bool success) { LobbyId = lobbyId; Success = success; }
    }

    /// <summary>Fires when the local user leaves / is kicked / loses connection to the current lobby.</summary>
    public readonly struct SteamLobbyLeftMessage
    {
        public readonly ulong LobbyId;
        public SteamLobbyLeftMessage(ulong lobbyId) { LobbyId = lobbyId; }
    }

    /// <summary>Another member's state in the current lobby changed.</summary>
    public readonly struct SteamLobbyMemberChangedMessage
    {
        public readonly ulong LobbyId;
        public readonly ulong SteamId;
        public readonly SteamLobbyMemberEvent Event;
        public SteamLobbyMemberChangedMessage(ulong lobbyId, ulong steamId, SteamLobbyMemberEvent ev)
        {
            LobbyId = lobbyId; SteamId = steamId; Event = ev;
        }
    }

    /// <summary>A friend invited the local user to a lobby. Typically the UI prompts Accept / Decline; accepting calls SteamLobbyService.Join(LobbyId).</summary>
    public readonly struct SteamLobbyInviteMessage
    {
        public readonly ulong LobbyId;
        public readonly ulong FromSteamId;
        public SteamLobbyInviteMessage(ulong lobbyId, ulong fromSteamId) { LobbyId = lobbyId; FromSteamId = fromSteamId; }
    }

    /// <summary>Emitted when the Steam overlay's "Join Game" button or a rich-presence deep-link resolves to a lobby. The service auto-joins; this event lets the UI flip to the lobby scene.</summary>
    public readonly struct SteamJoinRequestedMessage
    {
        public readonly ulong LobbyId;
        public readonly ulong FriendSteamId;
        public SteamJoinRequestedMessage(ulong lobbyId, ulong friendSteamId) { LobbyId = lobbyId; FriendSteamId = friendSteamId; }
    }

    /// <summary>Lobby or member metadata changed — game code re-reads via SteamLobbyService.GetData / GetMemberData.</summary>
    public readonly struct SteamLobbyDataChangedMessage
    {
        public readonly ulong LobbyId;
        public readonly ulong SubjectSteamId;  // 0 = lobby-level data, else per-member.
        public SteamLobbyDataChangedMessage(ulong lobbyId, ulong subjectSteamId) { LobbyId = lobbyId; SubjectSteamId = subjectSteamId; }
    }

    /// <summary>Incoming P2P packet on the given channel. Payload is a copy — caller owns it.</summary>
    public readonly struct SteamNetworkPacketMessage
    {
        public readonly ulong  FromSteamId;
        public readonly int    Channel;
        public readonly byte[] Payload;
        public SteamNetworkPacketMessage(ulong fromSteamId, int channel, byte[] payload)
        {
            FromSteamId = fromSteamId; Channel = channel; Payload = payload;
        }
    }

    /// <summary>Remote peer opened a networking session with the local user. The service auto-accepts sessions from lobby members; this event is informational.</summary>
    public readonly struct SteamNetworkSessionRequestMessage
    {
        public readonly ulong FromSteamId;
        public SteamNetworkSessionRequestMessage(ulong fromSteamId) { FromSteamId = fromSteamId; }
    }

    /// <summary>A networking session failed (timeout, banned, unreachable). Matches Steam's ESteamNetConnectionEnd broad categories.</summary>
    public readonly struct SteamNetworkSessionFailedMessage
    {
        public readonly ulong RemoteSteamId;
        public readonly int   ReasonCode;
        public SteamNetworkSessionFailedMessage(ulong remoteSteamId, int reasonCode)
        {
            RemoteSteamId = remoteSteamId; ReasonCode = reasonCode;
        }
    }
}
