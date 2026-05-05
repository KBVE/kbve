#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using RareIcon.Platform.Netcode;
using Unity.Entities;
using Unity.NetCode;

namespace RareIcon
{
    /// <summary>Server-world bootstrap — spawns a <see cref="NetworkStreamRequestListen"/> entity once per match start so NetCode binds the Steam driver to the local SteamID. Re-fires whenever <see cref="MultiplayerAuthority.Generation"/> ticks (Return-to-Title → new match).</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.ServerSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class MultiplayerServerListenSystem : SystemBase
    {
        int _lastGen = -1;

        protected override void OnUpdate()
        {
            if (_lastGen == MultiplayerAuthority.Generation) return;

            if (!MultiplayerAuthority.InMultiplayer || !MultiplayerAuthority.MatchStarted ||
                !MultiplayerAuthority.IsAuthority || MultiplayerAuthority.LocalSteamId == 0)
                return;

            var ep = SteamEndpoint.Encode(MultiplayerAuthority.LocalSteamId);
            var e  = EntityManager.CreateEntity();
            EntityManager.SetName(e, "NetworkStreamRequestListen");
            EntityManager.AddComponentData(e, new NetworkStreamRequestListen { Endpoint = ep });

            _lastGen = MultiplayerAuthority.Generation;
            UnityEngine.Debug.Log($"[MultiplayerNetCode] server listen requested on Steam id {MultiplayerAuthority.LocalSteamId}");
        }
    }

    /// <summary>Client-world bootstrap — spawns a <see cref="NetworkStreamRequestConnect"/> entity once per match start aimed at the host's SteamID. Re-fires on <see cref="MultiplayerAuthority.Generation"/> bumps so reconnects after Return-to-Title work without restarting the process.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class MultiplayerClientConnectSystem : SystemBase
    {
        int _lastGen = -1;

        protected override void OnUpdate()
        {
            if (_lastGen == MultiplayerAuthority.Generation) return;

            if (!MultiplayerAuthority.InMultiplayer || !MultiplayerAuthority.MatchStarted ||
                MultiplayerAuthority.IsAuthority || MultiplayerAuthority.HostSteamId == 0)
                return;

            var ep = SteamEndpoint.Encode(MultiplayerAuthority.HostSteamId);
            var e  = EntityManager.CreateEntity();
            EntityManager.SetName(e, "NetworkStreamRequestConnect");
            EntityManager.AddComponentData(e, new NetworkStreamRequestConnect { Endpoint = ep });

            _lastGen = MultiplayerAuthority.Generation;
            UnityEngine.Debug.Log($"[MultiplayerNetCode] client connect requested → host SteamID {MultiplayerAuthority.HostSteamId}");
        }
    }
}

#endif
