
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

            SteamPacketBridge.Initialize();

            return 0;
        }

        public int Bind(NetworkEndpoint endpoint)
        {

            ulong localSteamId = SteamLocalId.Current;
            _localEndpoint = endpoint == default
                ? SteamEndpoint.Encode(localSteamId)
                : endpoint;
            _bound = true;
            return 0;
        }

        public int Listen()
        {

            return _bound ? 0 : -1;
        }

        public void Dispose()
        {

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

                    if (!ReceiveQueue.EnqueuePacket(out var processor))
                        return;
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
