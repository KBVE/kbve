namespace KBVE.MMExtensions.SSDB
{
    /// <summary>
    /// Interface for coordinating Steam-related subsystems after initialization.
    /// </summary>
    public interface ISteamWorker
    {
        bool IsReady { get; }
        bool AchievementsReady { get; }
        bool FriendsReady { get; }

        // TODO: Add control methods if needed later
        // void RefreshPresence();
        // void ShutdownSteamFeatures();
    }
}
