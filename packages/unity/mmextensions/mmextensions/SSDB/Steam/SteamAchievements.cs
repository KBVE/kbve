using System;
using System.Threading;
using System.Linq;
using Cysharp.Threading.Tasks;
//using Cysharp.Threading.Tasks.Addressables;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using ObservableCollections;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.Feedbacks;
using KBVE.MMExtensions.Quests;
using Achievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;


namespace KBVE.MMExtensions.SSDB.Steam
{
    public class SteamAchievements : MonoBehaviour, MMEventListener<MMAchievementUnlockedEvent>, IAsyncStartable, IDisposable
    {
        private CancellationTokenSource _cts;
        private readonly CompositeDisposable _disposables = new();
        private SteamworksService _steamworksService;
        public ObservableList<MMQuest> LoadedQuests { get; } = new();
        public ReactiveProperty<bool> QuestsReady { get; } = new(false);

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
                await UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: linkedToken);

                await LoadQuestAchievements(linkedToken);

                MMEventManager.AddListener<MMAchievementUnlockedEvent>(this);
            }
            catch (OperationCanceledException)
            {
                Debug.LogWarning("[SteamAchievements] Initialization canceled.");
            }
        }
        private async UniTask LoadQuestAchievements(CancellationToken cancellationToken)
        {
            var handle = Addressables.LoadAssetAsync<MMAchievementList>("MMAchievementList");
            await handle.ToUniTask(cancellationToken: cancellationToken);

            if (handle.Status != AsyncOperationStatus.Succeeded)
            {
                Debug.LogError("[SteamAchievements] Failed to load MMAchievementList from Addressables.");
                return;
            }

            var list = handle.Result;

            LoadedQuests.Clear();
            foreach (var mm in list.Achievements)
            {
                var quest = ScriptableObject.CreateInstance<MMQuest>();
                quest.CopyFromMMAchievement(mm);
                LoadedQuests.Add(quest);
            }

            MMAchievementManager.LoadAchievementList(list);
            MMAchievementManager.LoadSavedAchievements();

            QuestsReady.Value = true;
        }

        public void OnMMEvent(MMAchievementUnlockedEvent eventType)
        {
            var achievement = eventType.Achievement;

            if (achievement == null || string.IsNullOrWhiteSpace(achievement.AchievementID))
            {
                Debug.LogError("[SteamAchievements] Received MMAchievementUnlockedEvent with invalid data.");
                return;
            }

            var questFound = LoadedQuests.FirstOrDefault(q => string.Equals(q.AchievementID, achievement.AchievementID, StringComparison.Ordinal));

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
    }
}
