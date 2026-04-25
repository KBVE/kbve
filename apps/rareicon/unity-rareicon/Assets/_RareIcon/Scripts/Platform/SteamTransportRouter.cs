// Game-level transport helper that sits on top of SteamNetworkingService.
// Provides host/client semantics derived from the current Steam lobby's
// owner and simple SendToHost / BroadcastToMembers methods, plus a
// typed channel map so game code doesn't hard-code raw channel numbers.
//
// This is NOT a Unity NetCode custom transport (that'd be a full custom
// INetworkInterface + NativeArray marshaling pass). When NetCode is
// wired, swap this layer for a real UTP transport; the game-level send
// API stays stable because it's just "bytes to peer / broadcast".
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using MessagePipe;
using VContainer.Unity;

namespace RareIcon.Platform
{
    /// <summary>Reserved channel IDs — SteamNetworkingService allocates 4 channels (0..3). Keep these in sync with SteamNetworkingService.MaxChannels if the budget grows.</summary>
    public static class SteamChannel
    {
        /// <summary>Snapshot / replicated state. Reliable + ordered.</summary>
        public const int Snapshot = 0;
        /// <summary>Input commands from clients to host. Unreliable (re-sent every tick).</summary>
        public const int Input    = 1;
        /// <summary>Chat + lobby control messages. Reliable.</summary>
        public const int Chat     = 2;
        /// <summary>RPC / event bus. Reliable.</summary>
        public const int Rpc      = 3;
    }

    public interface ISteamTransportRouter
    {
        bool IsHost { get; }
        bool IsConnected { get; }
        ulong HostSteamId { get; }
        bool SendToHost(ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag);
        int  BroadcastToMembers(ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag, bool includeSelf = false);
        bool SendToPeer(ulong remoteSteamId, ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag);
    }

    public sealed class SteamTransportRouter : ISteamTransportRouter, IStartable, IDisposable
    {
        readonly ISteamLobbyService      _lobby;
        readonly ISteamNetworkingService _net;
        readonly ISubscriber<SteamLobbyJoinedMessage>        _subJoined;
        readonly ISubscriber<SteamLobbyLeftMessage>          _subLeft;
        readonly ISubscriber<SteamLobbyMemberChangedMessage> _subMember;

        IDisposable _dJoined;
        IDisposable _dLeft;
        IDisposable _dMember;

        public bool IsHost =>
            _lobby.InLobby && _lobby.OwnerSteamId == SteamManager.LocalSteamId;

        public bool IsConnected => _lobby.InLobby;
        public ulong HostSteamId => _lobby.OwnerSteamId;

        public SteamTransportRouter(
            ISteamLobbyService lobby,
            ISteamNetworkingService net,
            ISubscriber<SteamLobbyJoinedMessage>        subJoined,
            ISubscriber<SteamLobbyLeftMessage>          subLeft,
            ISubscriber<SteamLobbyMemberChangedMessage> subMember)
        {
            _lobby     = lobby;
            _net       = net;
            _subJoined = subJoined;
            _subLeft   = subLeft;
            _subMember = subMember;
        }

        public void Start()
        {
            // Event hooks for future auto-session open/close. Today the
            // networking service creates sessions on demand (first Send
            // triggers a handshake); if we want pre-warmed sessions we'd
            // issue a zero-length Send on join here.
            _dJoined = _subJoined.Subscribe(_ => { /* placeholder */ });
            _dLeft   = _subLeft.Subscribe(_   => { /* placeholder */ });
            _dMember = _subMember.Subscribe(_ => { /* placeholder */ });
        }

        public void Dispose()
        {
            _dJoined?.Dispose();
            _dLeft?.Dispose();
            _dMember?.Dispose();
        }

        public bool SendToHost(ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag)
        {
            if (!_lobby.InLobby) return false;
            ulong host = _lobby.OwnerSteamId;
            if (host == 0UL || host == SteamManager.LocalSteamId) return false;
            return _net.Send(host, payload, flag, channel);
        }

        public int BroadcastToMembers(ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag, bool includeSelf = false)
        {
            if (!_lobby.InLobby) return 0;
            ulong self = SteamManager.LocalSteamId;
            int sent = 0;
            var members = _lobby.Members;
            for (int i = 0; i < members.Count; i++)
            {
                ulong id = members[i];
                if (!includeSelf && id == self) continue;
                if (_net.Send(id, payload, flag, channel)) sent++;
            }
            return sent;
        }

        public bool SendToPeer(ulong remoteSteamId, ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag) =>
            _lobby.InLobby && _net.Send(remoteSteamId, payload, flag, channel);
    }
}

#else

using System;

namespace RareIcon.Platform
{
    public static class SteamChannel { public const int Snapshot = 0, Input = 1, Chat = 2, Rpc = 3; }

    public interface ISteamTransportRouter
    {
        bool IsHost { get; }
        bool IsConnected { get; }
        ulong HostSteamId { get; }
        bool SendToHost(ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag);
        int  BroadcastToMembers(ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag, bool includeSelf = false);
        bool SendToPeer(ulong remoteSteamId, ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag);
    }

    public sealed class SteamTransportRouter : ISteamTransportRouter
    {
        public bool IsHost => false;
        public bool IsConnected => false;
        public ulong HostSteamId => 0UL;
        public bool SendToHost(ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag) => false;
        public int  BroadcastToMembers(ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag, bool includeSelf = false) => 0;
        public bool SendToPeer(ulong remoteSteamId, ReadOnlySpan<byte> payload, int channel, SteamSendFlag flag) => false;
    }
}

#endif
