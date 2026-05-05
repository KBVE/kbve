namespace RareIcon
{
    /// <summary>Top-level game mode flag. Stored in <see cref="LobbyDataKeys.Mode"/> when in a Steam lobby; written by the host on lobby create + read by every peer to pick the right gameplay sync layer when the match starts. Pure data enum so it can sit outside the Steam asmdef.</summary>
    public enum GameMode : byte
    {
        SinglePlayer = 0,
        PvECoop      = 1,
        PvP          = 2,
    }

    /// <summary>String keys for <see cref="ISteamLobbyService.SetData"/> / <see cref="ISteamLobbyService.GetData"/>. Lobbies stay tiny (~8 KB cap), so we only stamp what every peer needs to bootstrap a match: mode, world seed, started flag.</summary>
    public static class LobbyDataKeys
    {
        public const string Mode    = "rareicon.mode";       // GameMode byte as string
        public const string Seed    = "rareicon.seed";       // int32 as string
        public const string Started = "rareicon.started";    // "0" / "1"
        public const string AppVer  = "rareicon.appver";     // build version guard
    }
}
