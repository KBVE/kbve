// Minimal Unity Transport INetworkInterface backed by SteamPacketBridge.
// UTP treats this like any other transport — jobs produce outgoing
// packets into its PacketsQueue, we drain those into the Steam outgoing
// queue; incoming Steam packets flow back into UTP's receive queue each
// tick. All socket / connection setup is handled by SteamNetworkingService
// on the managed side; this interface is pure byte-shuffling.
//
// Compatible with Unity.Transport 2.x (NetCode 1.x). API surface may
// need tweaks on future NetCode upgrades — see NetworkDriverStore +
// INetworkInterface changelog in com.unity.transport.
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Jobs;
using Unity.Networking.Transport;

namespace RareIcon.Platform.Netcode
{
    public struct SteamNetworkInterface : INetworkInterface
    {
        NetworkEndpoint _localEndpoint;
        bool            _bound;

        public NetworkEndpoint LocalEndpoint => _localEndpoint;

        public int Initialize(ref NetworkSettings settings, ref int packetPadding)
        {
            // Ensure the bridge exists before any job touches it. Safe to
            // call repeatedly — it's idempotent.
            SteamPacketBridge.Initialize();
            // No padding needed; Steam delivers raw payloads.
            return 0;
        }

        public int Bind(NetworkEndpoint endpoint)
        {
            // Bind is a no-op on Steam — the SDK handles identity routing.
            // We just remember the local endpoint so UTP has something to
            // return on queries. If the caller passed in a real endpoint
            // (rare for Steam paths) echo it; otherwise synthesise one
            // from the local SteamID.
            ulong localSteamId = SteamLocalId.Current;
            _localEndpoint = endpoint == default
                ? SteamEndpoint.Encode(localSteamId)
                : endpoint;
            _bound = true;
            return 0;
        }

        public int Listen()
        {
            // Steam P2P is always listening once Init() succeeded. No-op.
            return _bound ? 0 : -1;
        }

        public void Dispose()
        {
            // Bridge teardown is owned by SteamNetworkDriverConstructor
            // (it's shared across client + server worlds in the editor,
            // so only the last owner should Shutdown).
        }

        public JobHandle ScheduleReceive(ref ReceiveJobArguments arguments, JobHandle dep) =>
            new ReceiveJob
            {
                ReceiveQueue = arguments.ReceiveQueue,
                Incoming     = SteamPacketBridge.Incoming,
            }.Schedule(dep);

        public JobHandle ScheduleSend(ref SendJobArguments arguments, JobHandle dep) =>
            new SendJob
            {
                SendQueue = arguments.SendQueue,
                Outgoing  = SteamPacketBridge.Outgoing.AsParallelWriter(),
            }.Schedule(dep);

        [BurstCompile]
        struct ReceiveJob : IJob
        {
            public PacketsQueue              ReceiveQueue;
            public NativeQueue<SteamPacket> Incoming;

            public unsafe void Execute()
            {
                while (Incoming.TryDequeue(out var packet))
                {
                    // PacketsQueue.EnqueuePacket in Unity.Transport 2.x
                    // returns a bool + emits the PacketProcessor via out.
                    if (!ReceiveQueue.EnqueuePacket(out var processor))
                        return;  // UTP's queue is full; drop + retry next tick.
                    processor.EndpointRef = packet.Endpoint;
                    processor.AppendToPayload(packet.Data, packet.Length);
                }
            }
        }

        [BurstCompile]
        struct SendJob : IJob
        {
            public PacketsQueue                         SendQueue;
            public NativeQueue<SteamPacket>.ParallelWriter Outgoing;

            public unsafe void Execute()
            {
                int count = SendQueue.Count;
                for (int i = 0; i < count; i++)
                {
                    var proc = SendQueue[i];
                    int len = proc.Length;
                    if (len <= 0 || len > SteamPacket.MaxPayload) continue;

                    var packet = new SteamPacket
                    {
                        Endpoint = proc.EndpointRef,
                        Length   = len,
                    };
                    UnsafeUtility.MemCpy(packet.Data, proc.GetUnsafePayloadPtr(), len);
                    Outgoing.Enqueue(packet);
                }
            }
        }
    }

    /// <summary>Main-thread accessor for the local SteamID; Burst can't call SteamManager.LocalSteamId directly because the getter chain crosses into managed Steamworks.NET. SteamNetworkDriverConstructor refreshes this static before driver creation.</summary>
    public static class SteamLocalId
    {
        public static ulong Current;
    }
}

#endif
