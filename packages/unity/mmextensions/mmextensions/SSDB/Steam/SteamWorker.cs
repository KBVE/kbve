using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using ObservableCollections;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.API;
using PlayerLoopTiming = Cysharp.Threading.Tasks.PlayerLoopTiming;
using SteamAchievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;
using FriendsAPI = Heathen.SteamworksIntegration.API.Friends.Client;
using Steamworks;

namespace KBVE.MMExtensions.SSDB.Steam
{
    public class AchievementInfo
    {
        public string ApiName { get; set; }
        public string DisplayName { get; set; }
        public bool IsAchieved { get; set; }
        public DateTime UnlockTime { get; set; }
    }

    public class SteamWorker : IAsyncStartable, ISteamWorker, IDisposable
    {
        private readonly ISteamworksService _steamworksService;
        private readonly CompositeDisposable _disposables = new();

        public ReactiveProperty<bool> IsInitialized { get; } = new(false);
        public ReactiveProperty<bool> AchievementsReady { get; } = new(false);
        public ReactiveProperty<bool> FriendsReady { get; } = new(false);

        public ReactiveProperty<string> PlayerName { get; } = new(string.Empty);
        public ReactiveProperty<ulong> SteamId { get; } = new(0);
        public ReactiveProperty<bool> IsReadySignal { get; } = new(false);

        public ObservableList<UserData> Friends { get; } = new();
        public ObservableList<AchievementInfo> Achievements { get; } = new();

        private readonly Subject<AchievementInfo> _achievementStream = new();
        public IObservable<AchievementInfo> AchievementStream => (IObservable<AchievementInfo>)_achievementStream;

        private readonly Subject<UserData> _friendStream = new();
        public IObservable<UserData> FriendStream => (IObservable<UserData>)_friendStream;

        public bool IsReady => IsInitialized.Value && AchievementsReady.Value && FriendsReady.Value;

        [Inject]
        public SteamWorker(ISteamworksService steamworksService)
        {
            _steamworksService = steamworksService;
        }

        public UniTask InitializeAsync(CancellationToken cancellationToken) => StartAsync(cancellationToken);

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            await UniTask.WaitUntil(() => _steamworksService.Initialized.Value, cancellationToken: cancellationToken);

            if (_steamworksService.LocalUser.Value is { } user)
            {
                IsInitialized.Value = true;
                PlayerName.Value = user.Name;
                SteamId.Value = user.FriendId;
            }

            await UniTask.WhenAll(
                InitializeAchievementsAsync(cancellationToken),
                InitializeFriendsAsync(cancellationToken)
            );

            IsReadySignal.Value = IsReady;
        }

        private async UniTask InitializeAchievementsAsync(CancellationToken cancellationToken)
        {
            try
            {
                await UniTask.Yield(PlayerLoopTiming.Update, cancellationToken);
                Achievements.Clear();

                foreach (var achievement in SteamSettings.Achievements)
                {
                    if (SteamAchievements.GetAchievement(achievement.ApiName, out var achieved, out var unlockTime))
                    {
                        var data = new AchievementInfo
                        {
                            ApiName = achievement.ApiName,
                            DisplayName = achievement.Name,
                            IsAchieved = achieved,
                            UnlockTime = unlockTime
                        };

                        Achievements.Add(data);
                        _achievementStream.OnNext(data);
                    }
                }


                Debug.Log($"[SteamWorker] Loaded {Achievements.Count} achievements.");
                AchievementsReady.Value = true;
            }
            catch (OperationCanceledException)
            {
                Debug.LogWarning("[SteamWorker] Achievement loading was canceled.");
                AchievementsReady.Value = false;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SteamWorker] Failed to initialize achievements: {ex.Message}");
                AchievementsReady.Value = false;
            }
        }

        private async UniTask InitializeFriendsAsync(CancellationToken cancellationToken)
        {
            try
            {
                await UniTask.Yield(PlayerLoopTiming.Update);

                Friends.Clear();
                var friendsList = FriendsAPI.GetFriends(Steamworks.EFriendFlags.k_EFriendFlagImmediate);
                //var friendsList = UserData.MyFriends;

                foreach (var friend in friendsList)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    Friends.Add(friend);
                    _friendStream.OnNext(friend);
                }
                FriendsReady.Value = true;
            }
            catch (OperationCanceledException)
            {
                Debug.LogWarning("[SteamWorker] Friend loading was canceled.");
                FriendsReady.Value = false;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SteamWorker] Failed to initialize friends: {ex.Message}");
                FriendsReady.Value = false;
            }
        }
        void IDisposable.Dispose()
        {
            _disposables.Dispose();
            _achievementStream.Dispose();
            _friendStream.Dispose();
        }
    }
}
