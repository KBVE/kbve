#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

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
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator;

using PlayerLoopTiming = Cysharp.Threading.Tasks.PlayerLoopTiming;
using SteamworksAchievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;
using FriendsAPI = Heathen.SteamworksIntegration.API.Friends.Client;
using Steamworks;


namespace KBVE.SSDB.Steam
{
    public class SteamworksService : IAsyncStartable, ISteamworksService, IDisposable
    {
        private const int AppId = 2238370;
        private readonly CompositeDisposable _disposables = new();

        public ReactiveProperty<bool> Initialized { get; } = new(false);
        public ReactiveProperty<UserData?> LocalUser { get; } = new(null);

        public ReactiveProperty<bool> AchievementsReady { get; } = new(false);
        public ReactiveProperty<bool> FriendsReady { get; } = new(false);
        public ReactiveProperty<bool> IsReadySignal { get; } = new(false);
        public bool IsReady => Initialized.Value && AchievementsReady.Value && FriendsReady.Value;

        public ReactiveProperty<string> PlayerName { get; } = new(string.Empty);
        public ReactiveProperty<ulong> SteamId { get; } = new(0);

        public ObservableList<UserData> Friends { get; } = new();
        public ObservableList<AchievementInfo> Achievements { get; } = new();

        private readonly Subject<AchievementInfo> _achievementStream = new();
        public IObservable<AchievementInfo> AchievementStream => (IObservable<AchievementInfo>)_achievementStream;

        private readonly Subject<UserData> _friendStream = new();
        public IObservable<UserData> FriendStream => (IObservable<UserData>)_friendStream;

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            try
            {
                if (!App.Initialized)
                {
                    Debug.Log("[SteamworksService] Initializing Steam...");
                    App.Client.Initialize(AppId);
                    await UniTask.WaitUntil(() => App.Initialized, cancellationToken: cancellationToken);
                }

                await Operator.R(); //await Operator.Ready;

                Operator.Toast?.Show("Steam initialized", MMExtensions.Orchestrator.Core.ToastType.Info, 2.5f);
                
                Initialized.Value = true;
                LocalUser.Value = UserData.Me;

                Operator.Toast?.Show($"Welcome  {UserData.Me.Name}", MMExtensions.Orchestrator.Core.ToastType.Success, 2.5f);
                Debug.Log($"[SteamworksService] Logged in as {UserData.Me.Name}");

                PlayerName.Value = UserData.Me.Name;
                SteamId.Value = UserData.Me.FriendId;

                await UniTask.WhenAll(
                    //InitializeAchievementsAsync(cancellationToken),
                    SyncAchievementsFromQuest(cancellationToken),
                    InitializeFriendsAsync(cancellationToken)
                );

                IsReadySignal.Value = IsReady;
            }
            catch (OperationCanceledException)
            {
                Debug.LogWarning("[SteamworksService] Initialization was canceled.");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SteamworksService] Unexpected error during Steam initialization: {ex}");
            }
        }

        private async UniTask SyncAchievementsFromQuest(CancellationToken cancellationToken)
        {
            try
            {
                await Operator.Quest.QuestsReady.WaitUntilTrue(cancellationToken);
                Achievements.Clear();

                Debug.Log($"Quests found ready: {Operator.Quest.LoadedQuests.Count}");

                foreach (var quest in Operator.Quest.LoadedQuests)
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    var steam = quest.SteamAchievement;
                    Debug.Log($"quest.SteamAchievement? {steam} api name {steam.apiName}");
                    
                    if (steam == null || string.IsNullOrWhiteSpace(steam.apiName))
                        continue;

                    bool success = SteamworksAchievements.GetAchievement(steam.apiName, out var achieved, out var unlockTime);
                    Debug.Log($"Successful steamworks call? {success} achieved? {achieved} unlockTime? {unlockTime}");
                    if (success)
                    {
                        var info = new AchievementInfo
                        {
                            ApiName = steam.apiName,
                            DisplayName = quest.Title,
                            IsAchieved = achieved,
                            UnlockTime = unlockTime
                        };

                        Achievements.Add(info);
                        _achievementStream.OnNext(info);
                    }
                }

                Debug.Log($"[SteamworksService] Synced {Achievements.Count} achievements from QuestDB.");
                AchievementsReady.Value = true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SteamworksService] Failed syncing achievements from quests: {ex.Message}");
                AchievementsReady.Value = false;
            }
        }


        // private async UniTask InitializeAchievementsAsync(CancellationToken cancellationToken)
        // {
        //     try
        //     {
        //         await UniTask.Yield(PlayerLoopTiming.Update, cancellationToken);
        //         Achievements.Clear();

        //         var achievementsList = SteamSettings.Achievements;

        //         if (achievementsList == null || achievementsList.Count == 0)
        //         {
        //             Debug.LogWarning("[SteamworksService] No achievements found in SteamSettings.");
        //             AchievementsReady.Value = true;
        //             return;
        //         }

        //         foreach (var achievement in achievementsList)
        //         {
        //             if (achievement == null || string.IsNullOrWhiteSpace(achievement.ApiName))
        //             {
        //                 Debug.LogWarning("[SteamworksService] Skipping null or malformed achievement entry.");
        //                 continue;
        //             }

        //             if (SteamAchievements.GetAchievement(achievement.ApiName, out var achieved, out var unlockTime))
        //             {
        //                 var data = new AchievementInfo
        //                 {
        //                     ApiName = achievement.ApiName,
        //                     DisplayName = achievement.Name,
        //                     IsAchieved = achieved,
        //                     UnlockTime = unlockTime
        //                 };

        //                 Achievements.Add(data);
        //                 _achievementStream.OnNext(data);
        //             }
        //             else
        //             {
        //                 Debug.LogWarning($"[SteamworksService] Achievement not found in Steam: {achievement.ApiName}");
        //             }
        //         }

        //         Debug.Log($"[SteamworksService] Loaded {Achievements.Count} achievements.");
        //         AchievementsReady.Value = true;
        //     }
        //     catch (OperationCanceledException)
        //     {
        //         Debug.LogWarning("[SteamworksService] Achievement loading was canceled.");
        //         AchievementsReady.Value = false;
        //     }
        //     catch (Exception ex)
        //     {
        //         Debug.LogError($"[SteamworksService] Failed to initialize achievements: {ex.Message}");
        //         AchievementsReady.Value = false;
        //     }
        // }


        private async UniTask InitializeFriendsAsync(CancellationToken cancellationToken)
        {
            try
            {
                await UniTask.Yield(PlayerLoopTiming.Update, cancellationToken);

                Friends.Clear();
                var friendsList = FriendsAPI.GetFriends(EFriendFlags.k_EFriendFlagImmediate);

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
                Debug.LogWarning("[SteamworksService] Friend loading was canceled.");
                FriendsReady.Value = false;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SteamworksService] Failed to initialize friends: {ex.Message}");
                FriendsReady.Value = false;
            }
        }

        public void Dispose()
        {
            _disposables.Dispose();
            _achievementStream.Dispose();
            _friendStream.Dispose();
        }
    }
}

#endif
