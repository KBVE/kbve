#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using Unity.NetCode;

namespace RareIcon.Platform.Netcode
{
    /// <summary>Custom NetCode bootstrap. Sets <see cref="Unity.NetCode.NetworkStreamReceiveSystem.DriverConstructor"/> to <see cref="SteamNetworkDriverConstructor"/> BEFORE any world is created — fixes the race where the legacy <c>[RuntimeInitializeOnLoadMethod(BeforeSceneLoad)]</c> auto-installer could lose the ordering coin-flip against Unity Entities' own BeforeSceneLoad world initialization, leaving NetCode with the default UDP/IPC constructor and producing <c>"Failed to create UDP socket"</c> at <c>NetworkStreamRequestListen</c> time. Inheriting from <see cref="ClientServerBootstrap"/> means we still get NetCode's standard auto-world creation; we only inject the driver swap at the start of <see cref="Initialize"/>.</summary>
    public sealed class RareIconClientServerBootstrap : ClientServerBootstrap
    {
        public override bool Initialize(string defaultWorldName)
        {
            NetworkStreamReceiveSystem.DriverConstructor = new SteamNetworkDriverConstructor();
            return base.Initialize(defaultWorldName);
        }
    }
}

#endif
