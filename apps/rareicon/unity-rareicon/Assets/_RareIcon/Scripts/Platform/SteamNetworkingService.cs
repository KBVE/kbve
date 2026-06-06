
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using System.Runtime.InteropServices;
using MessagePipe;
using RareIcon.Platform.Netcode;
using Steamworks;
using UnityEngine;
using VContainer.Unity;

namespace RareIcon.Platform
{
    /// <summary>Send guarantees mirrored from Steam's constants. Reliable = ordered + guaranteed delivery; Unreliable = fire-and-forget low-latency.</summary>
    public enum SteamSendFlag : int
    {
        Unreliable = Constants.k_nSteamNetworkingSend_Unreliable,
        Reliable   = Constants.k_nSteamNetworkingSend_Reliable,
    }

    public interface ISteamNetworkingService
    {
        /// <summary>Send bytes to a peer on the given channel. Returns false when Steam isn't ready or the send call fails.</summary>
        bool Send(ulong remoteSteamId, ReadOnlySpan<byte> payload, SteamSendFlag flag, int channel = 0);
        /// <summary>Tear down any session with the peer. Remote receives SteamNetworkSessionFailedMessage.</summary>
        void CloseSession(ulong remoteSteamId);
    }

    public sealed class SteamNetworkingService : ISteamNetworkingService, IStartable, ITickable, IDisposable
    {
        const int MaxChannels       = 4;
        const int MaxMessagesPerPoll = 32;

        readonly ISteamLobbyService _lobby;
        readonly IPublisher<SteamNetworkPacketMessage>         _pubPacket;
        readonly IPublisher<SteamNetworkSessionRequestMessage> _pubSessionReq;
        readonly IPublisher<SteamNetworkSessionFailedMessage>  _pubSessionFail;

        Callback<SteamNetworkingMessagesSessionRequest_t> _cbSessionReq;
        Callback<SteamNetworkingMessagesSessionFailed_t>  _cbSessionFail;

        readonly IntPtr[] _msgBuf = new IntPtr[MaxMessagesPerPoll];

        public SteamNetworkingService(
            ISteamLobbyService lobby,
            IPublisher<SteamNetworkPacketMessage>         pubPacket,
            IPublisher<SteamNetworkSessionRequestMessage> pubSessionReq,
            IPublisher<SteamNetworkSessionFailedMessage>  pubSessionFail)
        {
            _lobby          = lobby;
            _pubPacket      = pubPacket;
            _pubSessionReq  = pubSessionReq;
            _pubSessionFail = pubSessionFail;
        }

        public void Start()
        {
            if (!SteamManager.IsReady) return;
            _cbSessionReq  = Callback<SteamNetworkingMessagesSessionRequest_t>.Create(OnSessionRequest);
            _cbSessionFail = Callback<SteamNetworkingMessagesSessionFailed_t>.Create(OnSessionFailed);
        }

        public void Dispose()
        {
            _cbSessionReq?.Dispose();
            _cbSessionFail?.Dispose();
        }

        public void Tick()
        {
            if (!SteamManager.IsReady) return;
            for (int ch = 0; ch < MaxChannels; ch++) PollChannel(ch);

            if (SteamPacketBridge.IsInitialized)
                SteamPacketBridge.DrainOutgoing(DispatchUtpPacket);
        }

        const int UtpChannel = 0;
        void DispatchUtpPacket(ulong remoteSteamId, byte[] payload) =>
            Send(remoteSteamId, payload, SteamSendFlag.Reliable, UtpChannel);

        public bool Send(ulong remoteSteamId, ReadOnlySpan<byte> payload, SteamSendFlag flag, int channel = 0)
        {
            if (!SteamManager.IsReady || payload.Length == 0) return false;
            if (channel < 0 || channel >= MaxChannels)
            {
                Debug.LogWarning($"[SteamNet] send channel {channel} out of range [0,{MaxChannels});");
                return false;
            }

            var identity = new SteamNetworkingIdentity();
            identity.SetSteamID(new CSteamID(remoteSteamId));

            IntPtr buf = Marshal.AllocHGlobal(payload.Length);
            try
            {
                unsafe
                {
                    fixed (byte* src = payload)
                    {
                        Buffer.MemoryCopy(src, (void*)buf, payload.Length, payload.Length);
                    }
                }
                var result = SteamNetworkingMessages.SendMessageToUser(
                    ref identity, buf, (uint)payload.Length, (int)flag, channel);
                return result == EResult.k_EResultOK;
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }

        public void CloseSession(ulong remoteSteamId)
        {
            if (!SteamManager.IsReady) return;
            var identity = new SteamNetworkingIdentity();
            identity.SetSteamID(new CSteamID(remoteSteamId));
            SteamNetworkingMessages.CloseSessionWithUser(ref identity);
        }

        void OnSessionRequest(SteamNetworkingMessagesSessionRequest_t evt)
        {
            var remote = evt.m_identityRemote.GetSteamID();
            bool trusted = IsLobbyMember(remote.m_SteamID);
            if (trusted)
            {
                var identity = evt.m_identityRemote;
                SteamNetworkingMessages.AcceptSessionWithUser(ref identity);
                _pubSessionReq.Publish(new SteamNetworkSessionRequestMessage(remote.m_SteamID));
            }

        }

        void OnSessionFailed(SteamNetworkingMessagesSessionFailed_t evt)
        {
            var remote = evt.m_info.m_identityRemote.GetSteamID();
            _pubSessionFail.Publish(new SteamNetworkSessionFailedMessage(
                remote.m_SteamID, (int)evt.m_info.m_eEndReason));
        }

        bool IsLobbyMember(ulong steamId)
        {
            if (_lobby == null || !_lobby.InLobby) return false;
            var members = _lobby.Members;
            for (int i = 0; i < members.Count; i++)
                if (members[i] == steamId) return true;
            return false;
        }

        void PollChannel(int channel)
        {
            int received = SteamNetworkingMessages.ReceiveMessagesOnChannel(channel, _msgBuf, _msgBuf.Length);
            for (int i = 0; i < received; i++)
            {
                var ptr = _msgBuf[i];
                if (ptr == IntPtr.Zero) continue;
                try
                {
                    var msg = Marshal.PtrToStructure<SteamNetworkingMessage_t>(ptr);
                    var payload = new byte[msg.m_cbSize];
                    if (msg.m_cbSize > 0)
                        Marshal.Copy(msg.m_pData, payload, 0, msg.m_cbSize);
                    ulong from = msg.m_identityPeer.GetSteamID().m_SteamID;

                    _pubPacket.Publish(new SteamNetworkPacketMessage(from, channel, payload));

                    if (channel == UtpChannel && SteamPacketBridge.IsInitialized)
                        SteamPacketBridge.PushIncoming(from, payload);
                }
                finally
                {
                    SteamNetworkingMessage_t.Release(ptr);
                }
            }
        }
    }
}

#else

using System;

namespace RareIcon.Platform
{
    public enum SteamSendFlag : int { Unreliable = 0, Reliable = 8 }

    public interface ISteamNetworkingService
    {
        bool Send(ulong remoteSteamId, ReadOnlySpan<byte> payload, SteamSendFlag flag, int channel = 0);
        void CloseSession(ulong remoteSteamId);
    }

    public sealed class SteamNetworkingService : ISteamNetworkingService
    {
        public bool Send(ulong remoteSteamId, ReadOnlySpan<byte> payload, SteamSendFlag flag, int channel = 0) => false;
        public void CloseSession(ulong remoteSteamId) { }
    }
}

#endif
