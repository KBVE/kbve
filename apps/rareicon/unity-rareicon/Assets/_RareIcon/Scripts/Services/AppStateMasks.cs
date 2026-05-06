using System;

namespace RareIcon
{
    /// <summary>Bitwise mirror of <see cref="AppInterfaceState"/> — same set of app phases, encoded as flag bits so callers can check membership in groups (`(mask &amp; (AppMask.World | AppMask.InTile)) != 0`) without enum equality cascades. <see cref="AppStateController.CurrentMask"/> mirrors <see cref="AppStateController.Current"/> 1:1; transitions go through the same setter, both publish the same change. New UI surfaces should subscribe to the mask layer; existing <see cref="AppInterfaceState"/> consumers continue to work unchanged.</summary>
    [Flags]
    public enum AppMask : uint
    {
        None         = 0,
        Boot         = 1u << 0,
        Loading      = 1u << 1,
        MainMenu     = 1u << 2,
        EnterModal   = 1u << 3,
        Connecting   = 1u << 4,
        Lobby        = 1u << 5,
        WorldLoading = 1u << 6,
        World        = 1u << 7,
        InTile       = 1u << 8,
        Reconnecting = 1u << 9,
        Disconnected = 1u << 10,
        Error        = 1u << 11,
        GameOver     = 1u << 12,

        /// <summary>Active gameplay (world view OR in-tile drilldown).</summary>
        AnyWorldGameplay = World | InTile,
        /// <summary>Either flavour of network-connect handshake.</summary>
        AnyConnect       = Connecting | Reconnecting,
        /// <summary>Anywhere the player is past the title screen and inside an active match (loading + lobby + world + in-tile + game-over screen).</summary>
        AnyInRun         = WorldLoading | World | InTile | GameOver,
    }

    /// <summary>Bitwise enum for the title screen's left-rail sections. Single-bit-active under normal flow; <see cref="AppStateController.SwitchSection"/> clears the previous bit + sets the new one. Distinct from <see cref="AppMask"/> so the section state survives across <see cref="AppMask.MainMenu"/> ⇄ <see cref="AppMask.Lobby"/> hops and panels can subscribe to one canonical state instead of hand-tracking sibling visibility. Bits chosen to match the order of the visible menu rail, leaving headroom for future tabs.</summary>
    [Flags]
    public enum TitleSection : uint
    {
        None         = 0,
        MainMenu     = 1u << 0,
        SinglePlayer = 1u << 1,
        Continue     = 1u << 2,
        Multiplayer  = 1u << 3,
        Mods         = 1u << 4,
        Codex        = 1u << 5,
        Settings     = 1u << 6,
        Credits      = 1u << 7,
        Exit         = 1u << 8,
    }

    /// <summary>Maps <see cref="AppInterfaceState"/> ⇄ <see cref="AppMask"/>. One bit per state; conversion is a single shift, no allocation.</summary>
    public static class AppStateMaskExtensions
    {
        public static AppMask ToMask(this AppInterfaceState s) => s switch
        {
            AppInterfaceState.Boot         => AppMask.Boot,
            AppInterfaceState.Loading      => AppMask.Loading,
            AppInterfaceState.MainMenu     => AppMask.MainMenu,
            AppInterfaceState.EnterModal   => AppMask.EnterModal,
            AppInterfaceState.Connecting   => AppMask.Connecting,
            AppInterfaceState.Lobby        => AppMask.Lobby,
            AppInterfaceState.WorldLoading => AppMask.WorldLoading,
            AppInterfaceState.World        => AppMask.World,
            AppInterfaceState.InTile       => AppMask.InTile,
            AppInterfaceState.Reconnecting => AppMask.Reconnecting,
            AppInterfaceState.Disconnected => AppMask.Disconnected,
            AppInterfaceState.Error        => AppMask.Error,
            AppInterfaceState.GameOver     => AppMask.GameOver,
            _                              => AppMask.None,
        };

        /// <summary>Returns the lowest-bit <see cref="AppInterfaceState"/> represented by the mask. Multi-bit masks resolve to the lowest set bit; <see cref="AppMask.None"/> resolves to <see cref="AppInterfaceState.Boot"/> as a safe default.</summary>
        public static AppInterfaceState ToInterfaceState(this AppMask m)
        {
            if ((m & AppMask.Boot)         != 0) return AppInterfaceState.Boot;
            if ((m & AppMask.Loading)      != 0) return AppInterfaceState.Loading;
            if ((m & AppMask.MainMenu)     != 0) return AppInterfaceState.MainMenu;
            if ((m & AppMask.EnterModal)   != 0) return AppInterfaceState.EnterModal;
            if ((m & AppMask.Connecting)   != 0) return AppInterfaceState.Connecting;
            if ((m & AppMask.Lobby)        != 0) return AppInterfaceState.Lobby;
            if ((m & AppMask.WorldLoading) != 0) return AppInterfaceState.WorldLoading;
            if ((m & AppMask.World)        != 0) return AppInterfaceState.World;
            if ((m & AppMask.InTile)       != 0) return AppInterfaceState.InTile;
            if ((m & AppMask.Reconnecting) != 0) return AppInterfaceState.Reconnecting;
            if ((m & AppMask.Disconnected) != 0) return AppInterfaceState.Disconnected;
            if ((m & AppMask.Error)        != 0) return AppInterfaceState.Error;
            if ((m & AppMask.GameOver)     != 0) return AppInterfaceState.GameOver;
            return AppInterfaceState.Boot;
        }

        public static bool Has(this AppMask mask, AppMask any) => (mask & any) != 0;
        public static bool Has(this TitleSection mask, TitleSection any) => (mask & any) != 0;
    }
}
