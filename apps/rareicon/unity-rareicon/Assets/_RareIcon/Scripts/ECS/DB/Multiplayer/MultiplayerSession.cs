using Unity.Entities;

namespace RareIcon
{
    /// <summary>ECS-side mirror of <see cref="MultiplayerCoordinator"/> state. Singleton entity owned by <see cref="MultiplayerSessionBridge"/>; gameplay systems read it (or the static <see cref="MultiplayerAuthority"/> shortcut) to decide whether to run their authoritative logic. Host + single-player set <see cref="IsAuthority"/> = 1; clients set it to 0 so spawners / world-event drivers stand down and wait on replicated state.</summary>
    public struct MultiplayerSession : IComponentData
    {
        public byte Mode;          // GameMode byte
        public byte IsAuthority;   // 1 = host or solo, 0 = remote client
        public ulong LocalSteamId;
        public ulong HostSteamId;
        public byte InMultiplayer; // 1 when in a Steam lobby, 0 otherwise
    }

    /// <summary>Static fast-path so any system can check authority without doing a SystemAPI singleton fetch on the hot loop. Mirrored from the singleton by <see cref="MultiplayerSessionBridge"/> every frame the session changes. Defaults to <c>true</c> so existing single-player flow stays unaffected before MP infra spins up.</summary>
    public static class MultiplayerAuthority
    {
        /// <summary>True when this peer should run authoritative simulation (single-player solo, OR multiplayer host). Clients flip this to false on lobby join + back to true on leave.</summary>
        public static bool IsAuthority = true;

        /// <summary>True only when the peer is connected to a Steam lobby.</summary>
        public static bool InMultiplayer = false;

        /// <summary>Active match mode, if any. Defaults to SinglePlayer.</summary>
        public static GameMode Mode = GameMode.SinglePlayer;
    }
}
