// Injects the Steam-backed INetworkInterface into Unity NetCode's driver
// store. NetCodeConfig.Global.NetworkStreamDriverConstructor picks this
// up at bootstrap time.
//
// Usage — set once during application startup (TitleEntryPoint or a
// custom ClientServerBootstrap):
//
//   SteamNetworkDriverConstructor.Install();
//
// To fall back to UDP, call NetworkStreamReceiveSystem.DriverConstructor =
// new IPCAndSocketDriverConstructor(); (NetCode's default).
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using Unity.Entities;
using Unity.NetCode;
using Unity.Networking.Transport;
using Unity.Networking.Transport.Utilities;

namespace RareIcon.Platform.Netcode
{
    public sealed class SteamNetworkDriverConstructor : INetworkStreamDriverConstructor
    {
        /// <summary>One-shot install. Idempotent — calling twice just re-points to the same constructor.</summary>
        public static void Install()
        {
            SteamPacketBridge.Initialize();
            SteamLocalId.Current = SteamManager.LocalSteamId;
            var self = new SteamNetworkDriverConstructor();
            NetworkStreamReceiveSystem.DriverConstructor = self;
        }

        /// <summary>Tear the bridge down (editor quit / play-mode-exit cleanup).</summary>
        public static void Uninstall() => SteamPacketBridge.Shutdown();

        public void CreateClientDriver(World world, ref NetworkDriverStore driverStore, NetDebug netDebug)
        {
            var settings = DefaultDriverBuilder.GetNetworkSettings();
            RegisterDriver(ref driverStore, settings);
        }

        public void CreateServerDriver(World world, ref NetworkDriverStore driverStore, NetDebug netDebug)
        {
            var settings = DefaultDriverBuilder.GetNetworkServerSettings();
            RegisterDriver(ref driverStore, settings);
        }

        /// <summary>Lower-level registration path — bypasses DefaultDriverBuilder.RegisterClientDriver because that helper has overload variations across Unity NetCode versions. Directly creates the NetworkDriverInstance + the three pipelines (unreliable, reliable, unreliable-fragmented) that NetCode's snapshot + RPC systems query by name.</summary>
        static void RegisterDriver(ref NetworkDriverStore store, NetworkSettings settings)
        {
            var netIf = new SteamNetworkInterface();
            var driver = NetworkDriver.Create(netIf, settings);
            var instance = new NetworkDriverStore.NetworkDriverInstance
            {
                driver                        = driver,
                unreliablePipeline            = driver.CreatePipeline(typeof(NullPipelineStage)),
                reliablePipeline              = driver.CreatePipeline(typeof(ReliableSequencedPipelineStage)),
                unreliableFragmentedPipeline  = driver.CreatePipeline(typeof(FragmentationPipelineStage), typeof(UnreliableSequencedPipelineStage)),
            };
            store.RegisterDriver(TransportType.Socket, instance);
        }
    }
}

#endif
