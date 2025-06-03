using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using ObservableCollections;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.API;


namespace KBVE.MMExtensions.SSDB
{
    public interface ISteamWorker : IDisposable
    {
        ReactiveProperty<bool> IsInitialized { get; }
        ReactiveProperty<bool> AchievementsReady { get; }
        ReactiveProperty<bool> FriendsReady { get; }

        ReactiveProperty<string> PlayerName { get; }
        ReactiveProperty<ulong> SteamId { get; }

        ObservableList<UserData> Friends { get; }

        UniTask InitializeAsync(CancellationToken cancellationToken);

        bool IsReady { get; }
        ReactiveProperty<bool> IsReadySignal { get; }
    }
}