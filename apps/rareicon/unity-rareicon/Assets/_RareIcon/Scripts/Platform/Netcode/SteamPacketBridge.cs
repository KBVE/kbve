// Thread-safe packet bridge between managed SteamNetworkingService (main
// thread) and Burst-compiled Unity Transport jobs. Uses native queues so
// both sides stay allocator-friendly without GC churn. Static singleton
// pattern — Unity Transport's INetworkInterface is instantiated inside a
// NetworkDriver value type and can't carry managed refs, so the bridge
// has to be reachable from Burst via a static accessor.
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Networking.Transport;

namespace RareIcon.Platform.Netcode
{
    /// <summary>Fixed-size packet buffer shared between managed Steam callbacks and Burst UTP jobs. 1200 matches Steam's MTU and UTP's default max packet size.</summary>
    public struct SteamPacket : IDisposable
    {
        public const int MaxPayload = 1200;

        public NetworkEndpoint Endpoint;   // IPv6-encoded SteamID; see SteamEndpoint.Encode
        public int             Length;
        public unsafe fixed byte Data[MaxPayload];

        public void Dispose() { }
    }

    /// <summary>Encodes 64-bit SteamIDs as IPv6 NetworkEndpoints so UTP's address routing sees them as regular peers. The first 8 bytes of the v6 address carry the SteamID little-endian; the remaining 8 + port are zero. Uses NativeArray per the Unity.Transport 2.x SetRawAddressBytes contract.</summary>
    public static class SteamEndpoint
    {
        const ushort SteamPort = 0;  // Steam routes by identity, not port.

        public static NetworkEndpoint Encode(ulong steamId)
        {
            var ep = NetworkEndpoint.AnyIpv6.WithPort(SteamPort);
            var na = new NativeArray<byte>(16, Allocator.Temp, NativeArrayOptions.ClearMemory);
            unsafe
            {
                *(ulong*)na.GetUnsafePtr() = steamId;
            }
            ep.SetRawAddressBytes(na, NetworkFamily.Ipv6);
            na.Dispose();
            return ep;
        }

        public static ulong Decode(NetworkEndpoint endpoint)
        {
            var raw = endpoint.GetRawAddressBytes();
            if (!raw.IsCreated || raw.Length < 8) return 0UL;
            unsafe
            {
                return *(ulong*)raw.GetUnsafeReadOnlyPtr();
            }
        }
    }

    /// <summary>Global static bridge. Initialised by SteamNetworkDriverConstructor when Unity NetCode spins up the driver; torn down on world dispose. Both queues use Persistent allocation because they outlive individual frames.</summary>
    public static class SteamPacketBridge
    {
        static NativeQueue<SteamPacket> _incoming;
        static NativeQueue<SteamPacket> _outgoing;
        static bool _initialized;

        public static bool IsInitialized => _initialized;

        /// <summary>Read-only view on the incoming queue for Burst receive jobs.</summary>
        public static NativeQueue<SteamPacket> Incoming => _incoming;
        /// <summary>Outgoing queue for Burst send jobs to enqueue into; drained on main thread by SteamNetworkingService.</summary>
        public static NativeQueue<SteamPacket> Outgoing => _outgoing;

        public static void Initialize()
        {
            if (_initialized) return;
            _incoming = new NativeQueue<SteamPacket>(Allocator.Persistent);
            _outgoing = new NativeQueue<SteamPacket>(Allocator.Persistent);
            _initialized = true;
        }

        public static void Shutdown()
        {
            if (!_initialized) return;
            if (_incoming.IsCreated) _incoming.Dispose();
            if (_outgoing.IsCreated) _outgoing.Dispose();
            _initialized = false;
        }

        /// <summary>Called from SteamNetworkingService when a raw packet arrives. Copies into the queue (bounded to MaxPayload).</summary>
        public static unsafe void PushIncoming(ulong fromSteamId, byte[] payload)
        {
            if (!_initialized || payload == null) return;
            int len = payload.Length;
            if (len <= 0 || len > SteamPacket.MaxPayload) return;

            var packet = new SteamPacket
            {
                Endpoint = SteamEndpoint.Encode(fromSteamId),
                Length   = len,
            };
            fixed (byte* src = payload)
            {
                UnsafeUtility.MemCpy(packet.Data, src, len);
            }
            _incoming.Enqueue(packet);
        }

        /// <summary>Called from SteamNetworkingService each frame to forward UTP's outgoing queue through Steam's Send API. Returns the number of packets dispatched.</summary>
        public static unsafe int DrainOutgoing(Action<ulong, byte[]> send)
        {
            if (!_initialized) return 0;
            int count = 0;
            while (_outgoing.TryDequeue(out var packet))
            {
                if (packet.Length <= 0) continue;
                var buf = new byte[packet.Length];
                fixed (byte* dst = buf)
                {
                    UnsafeUtility.MemCpy(dst, packet.Data, packet.Length);
                }
                send(SteamEndpoint.Decode(packet.Endpoint), buf);
                count++;
            }
            return count;
        }
    }
}

#endif
