using System;
using System.Threading;
using System.Linq;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using ObservableCollections;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using KBVE.MMExtensions.Quests;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using KBVE.MMExtensions.Orchestrator;
using KBVE.MMExtensions.Orchestrator.Core;
#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID
using Achievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;
#endif

namespace KBVE.SSDB.Steam
{
    public class SteamAchievements : MonoBehaviour, MMEventListener<MMAchievementUnlockedEvent>, IAsyncStartable, IDisposable
    {

        #if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

        private CancellationTokenSource _cts;
        private readonly CompositeDisposable _disposables = new();
        private SteamworksService _steamworksService;

        [Inject]
        public void Construct(SteamworksService steamworksService)
        {
            _steamworksService = steamworksService;
        }
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            _cts = new CancellationTokenSource();
            var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellationToken).Token;

            try
            {
                await UniTask.WhenAll(
                    UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: linkedToken),
                    Operator.Quest.QuestsReady.WaitUntilTrue(linkedToken)
                );

                MMEventManager.AddListener<MMAchievementUnlockedEvent>(this);
            }
            catch (OperationCanceledException)
            {
                Debug.LogWarning("[SteamAchievements] Initialization canceled.");
            }
        }

       
        public void OnMMEvent(MMAchievementUnlockedEvent eventType)
        {
            var achievement = eventType.Achievement;

            if (achievement == null || string.IsNullOrWhiteSpace(achievement.AchievementID))
            {
                Debug.LogError("[SteamAchievements] Received MMAchievementUnlockedEvent with invalid data.");
                return;
            }

            var questFound = Operator.Quest.GetQuestByAchievementId(achievement.AchievementID);

            if (questFound == null)
            {
                Debug.LogWarning($"[SteamAchievements] No MMQuest found for AchievementID '{achievement.AchievementID}'.");
                return;
            }
            UnlockOnSteam(questFound).Forget();
        }

        public static async UniTask UnlockOnSteam(MMQuest completedQuest)
        {
            if (completedQuest == null || completedQuest.SteamAchievement == null || string.IsNullOrEmpty(completedQuest.SteamAchievement.apiName))
            {
                Debug.LogError("[UnlockOnSteam] Invalid MMQuest or SteamAchievement data.");
                return;
            }

            var apiName = completedQuest.SteamAchievement.apiName;
            Debug.Log($"[SteamAchievements] Unlocking {apiName}...");

            Achievements.SetAchievement(apiName);

            await UniTask.NextFrame(); // Let Steam register

            bool achieved = false;
            DateTime achievedTime;
            Achievements.GetAchievement(apiName, out achieved, out achievedTime);

            Debug.Log($"[SteamAchievements] Unlocked: {achieved} @ {achievedTime:MM/dd/yyyy}");

            Steamworks.SteamUserStats.StoreStats();
        }
        public void Dispose()
        {

            _cts?.Cancel();
            _cts?.Dispose();
            MMEventManager.RemoveListener<MMAchievementUnlockedEvent>(this);
            _disposables.Dispose();
        }

        #else
        public UniTask StartAsync(CancellationToken cancellationToken) => UniTask.CompletedTask;
        public void OnMMEvent(MMAchievementUnlockedEvent _) {}
        public void Dispose() {}
        #endif
    }
}
