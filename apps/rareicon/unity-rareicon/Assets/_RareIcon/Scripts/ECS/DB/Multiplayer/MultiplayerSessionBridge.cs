using Unity.Entities;

#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
using RareIcon.Platform;
using Steamworks;
#endif

namespace RareIcon
{
    /// <summary>Mirrors <see cref="MultiplayerCoordinator"/> + <see cref="ISteamLobbyService"/> state into the <see cref="MultiplayerSession"/> ECS singleton + the static <see cref="MultiplayerAuthority"/> fast-path. Always present (mobile / WebGL keep single-player defaults); the standalone build pulls live state from the Steam coordinator each frame. Cheap — 4 byte comparisons and a maybe-set; gateway for every Burst spawner that needs to ask "should I run?".</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class MultiplayerSessionBridge : SystemBase
    {
        Entity _singleton;

        protected override void OnCreate()
        {
            _singleton = EntityManager.CreateEntity(typeof(MultiplayerSession));
            EntityManager.SetName(_singleton, "MultiplayerSession");
            EntityManager.SetComponentData(_singleton, new MultiplayerSession
            {
                Mode          = (byte)GameMode.SinglePlayer,
                IsAuthority   = 1,
                InMultiplayer = 0,
            });
        }

        protected override void OnUpdate()
        {
            byte mode          = (byte)GameMode.SinglePlayer;
            byte isAuthority   = 1;
            byte inMultiplayer = 0;
            byte matchStarted  = 0;
            ulong local        = 0;
            ulong host         = 0;

#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
            var coord = MultiplayerAuthorityBridge.Coordinator;
            var lobby = MultiplayerAuthorityBridge.Lobby;
            if (coord != null && lobby != null && lobby.InLobby)
            {
                mode          = (byte)coord.Mode.CurrentValue;
                inMultiplayer = 1;
                host          = lobby.OwnerSteamId;
                try { local = SteamUser.GetSteamID().m_SteamID; } catch { local = 0; }
                isAuthority   = (byte)(coord.IsHost.CurrentValue ? 1 : 0);
                matchStarted  = (byte)(lobby.GetData(LobbyDataKeys.Started) == "1" ? 1 : 0);
            }
#endif

            var s = EntityManager.GetComponentData<MultiplayerSession>(_singleton);
            if (s.Mode != mode || s.IsAuthority != isAuthority ||
                s.InMultiplayer != inMultiplayer || s.LocalSteamId != local ||
                s.HostSteamId != host || s.MatchStarted != matchStarted)
            {
                s.Mode          = mode;
                s.IsAuthority   = isAuthority;
                s.InMultiplayer = inMultiplayer;
                s.LocalSteamId  = local;
                s.HostSteamId   = host;
                s.MatchStarted  = matchStarted;
                EntityManager.SetComponentData(_singleton, s);
            }

            bool prevStarted = MultiplayerAuthority.MatchStarted;
            MultiplayerAuthority.IsAuthority   = isAuthority == 1;
            MultiplayerAuthority.InMultiplayer = inMultiplayer == 1;
            MultiplayerAuthority.MatchStarted  = matchStarted == 1;
            MultiplayerAuthority.Mode          = (GameMode)mode;
            MultiplayerAuthority.LocalSteamId  = local;
            MultiplayerAuthority.HostSteamId   = host;
            if (prevStarted != MultiplayerAuthority.MatchStarted)
                MultiplayerAuthority.Generation++;
        }
    }

#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
    /// <summary>Static accessor pair the bridge reads from every frame. Wired in <see cref="RootLifetimeScope"/>'s build callback so the bridge can resolve managed services without breaking ECS' ctor-injection rules.</summary>
    public static class MultiplayerAuthorityBridge
    {
        public static MultiplayerCoordinator Coordinator;
        public static ISteamLobbyService     Lobby;
    }
#endif
}
