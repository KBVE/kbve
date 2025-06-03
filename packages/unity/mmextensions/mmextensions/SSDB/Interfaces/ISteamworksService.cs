namespace KBVE.MMExtensions.SSDB
{
    using Heathen.SteamworksIntegration;
    using Heathen.SteamworksIntegration.API;

    public interface ISteamworksService
    {
        bool Initialized { get; }
        UserData? LocalUser { get; }
    }
}