#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using ObservableCollections;
using R3;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.API;

namespace KBVE.SSDB
{
    public interface ISteamworksService : IDisposable
    {
        ReactiveProperty<bool> Initialized { get; }
        ReactiveProperty<UserData?> LocalUser { get; }
        ReactiveProperty<bool> AchievementsReady { get; }
        ReactiveProperty<bool> FriendsReady { get; }
        ReactiveProperty<bool> IsReadySignal { get; }
        bool IsReady { get; }

        ReactiveProperty<string> PlayerName { get; }
        ReactiveProperty<ulong> SteamId { get; }

        ObservableList<UserData> Friends { get; }
        ObservableList<AchievementInfo> Achievements { get; }

        IObservable<AchievementInfo> AchievementStream { get; }
        IObservable<UserData> FriendStream { get; }

    }
}

#endif