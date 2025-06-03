namespace KBVE.MMExtensions.SSDB
{
    using Heathen.SteamworksIntegration;
    using KBVE.MMExtensions.SSDB.Steam;
    using R3;

    public interface ISteamworksService
    {
        ReactiveProperty<bool> Initialized { get; }
        ReactiveProperty<UserData?> LocalUser { get; }
        SteamWorker Worker { get; } 
    }
}