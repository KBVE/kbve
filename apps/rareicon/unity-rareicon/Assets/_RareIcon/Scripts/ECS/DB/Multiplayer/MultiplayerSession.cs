using Unity.Entities;

namespace RareIcon
{
    /// <summary>ECS-side mirror of <see cref="MultiplayerCoordinator"/> state. Singleton entity owned by <see cref="MultiplayerSessionBridge"/>; gameplay systems read it (or the static <see cref="MultiplayerAuthority"/> shortcut) to decide whether to run their authoritative logic. Host + single-player set <see cref="IsAuthority"/> = 1; clients set it to 0 so spawners / world-event drivers stand down and wait on replicated state.</summary>
    public struct MultiplayerSession : IComponentData
    {
        public byte Mode;
        public byte IsAuthority;
        public ulong LocalSteamId;
        public ulong HostSteamId;
        public byte InMultiplayer;
        public byte MatchStarted;
    }

    /// <summary>Static fast-path so any system can check authority without doing a SystemAPI singleton fetch on the hot loop. Mirrored from the singleton by <see cref="MultiplayerSessionBridge"/> every frame the session changes. Defaults to <c>true</c> so existing single-player flow stays unaffected before MP infra spins up. Cross-world readable — NetCode Server / Client worlds query this without a singleton replication.</summary>
    public static class MultiplayerAuthority
    {
        /// <summary>True when this peer should run authoritative simulation (single-player solo, OR multiplayer host). Clients flip this to false on lobby join + back to true on leave.</summary>
        public static bool IsAuthority = true;

        /// <summary>True only when the peer is connected to a Steam lobby.</summary>
        public static bool InMultiplayer = false;

        /// <summary>True only when the lobby host has flipped <see cref="LobbyDataKeys.Started"/> to 1 — green-light for connect/listen request entities to spawn.</summary>
        public static bool MatchStarted = false;

        /// <summary>Active match mode, if any. Defaults to SinglePlayer.</summary>
        public static GameMode Mode = GameMode.SinglePlayer;

        /// <summary>Local peer's SteamID (server uses this for its listen endpoint; clients use it as the source identifier).</summary>
        public static ulong LocalSteamId = 0;

        /// <summary>Lobby owner's SteamID — clients dial this via <see cref="Steamworks"/> identity to open a NetCode session.</summary>
        public static ulong HostSteamId = 0;

        /// <summary>Bumped by <see cref="MultiplayerSessionBridge"/> every time the match transitions in/out of started so connect/listen systems can re-fire on a fresh run without hand-tracking flags.</summary>
        public static int Generation = 0;
    }
}
