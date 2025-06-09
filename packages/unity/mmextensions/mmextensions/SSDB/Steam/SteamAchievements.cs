using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using ObservableCollections;
using MoreMountains.Tools;
using KBVE.MMExtensions.Quests;
using KBVE.MMExtensions.Database;
using Achievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;
using System.Linq;

namespace KBVE.MMExtensions.SSDB.Steam
{
    public class SteamAchievements : MonoBehaviour, IAsyncStartable, IDisposable, MMEventListener<MMAchievementUnlockedEvent>
    {
        private readonly CompositeDisposable _disposables = new();
        private SteamworksService _steamworksService;

        [Inject]
        public void Construct(SteamworksService steamworksService)
        {
            _steamworksService = steamworksService;
        }
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            try
            {
                await UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: cancellationToken);

                MMEventManager.AddListener<MMAchievementUnlockedEvent>(this);
            }
            catch (OperationCanceledException)
            {
                Debug.Log("[SteamAchievements] StartAsync was canceled.");
            }
        }

        public void OnMMEvent(MMAchievementUnlockedEvent eventType)
        {
            if (eventType.Achievement == null || string.IsNullOrEmpty(eventType.Achievement.AchievementID))
            {
                Debug.LogError("[MMEvents] Invalid AchievementID.");
                return;
            }

            //get the quest from the saved achievements repository using the MMAchievement id
            MMQuest questFound = EditorQuestDB.LoadedQuests.FirstOrDefault(a => a.AchievementID != null
                && a.AchievementID == eventType.Achievement.AchievementID);

            if (questFound == null)
            {
                Debug.LogError("[Steam Achievement Failed] MMQuest not found in loaded quests list");
                return;
            }

            UnlockOnSteam(questFound);
        }

        //call to steam to unlock achievement
        public static void UnlockOnSteam(MMQuest completedQuest)
        {
            if (completedQuest == null || completedQuest.SteamAchievement == null)
            {
                Debug.LogError("[UnlockOnSteam Failed] MMQuest does not have a valid quest and/or SteamAchievement");
                return;
            }

            Debug.Log("SetAchievement called " + completedQuest.SteamAchievement.apiName);

            Achievements.SetAchievement(completedQuest.SteamAchievement.apiName);//"ACH_AUTO_COOKER_TEST");        

            bool achieved = false;
            DateTime achieveTime;

            Achievements.GetAchievement(completedQuest.SteamAchievement.apiName, out achieved, out achieveTime);
            //Achievements.GetAchievement(eventType.Achievement.AchievementID, out achieved);

            Debug.Log("Achievement activated? " + achieved);
            Debug.Log("Achievement activated called " + achieveTime.ToString("MM/DD/YYYY"));

            // AchievementData myAch = eventType.Achievement.AchievementID;
            // var achState = myAch.GetAchievementAndUnlockTime(user);

            //Store stats to Steam to update the user on Steam's server manually now
            Steamworks.SteamUserStats.StoreStats();
        }

        public void Dispose()
        {
            MMEventManager.RemoveListener<MMAchievementUnlockedEvent>(this);
            _disposables.Dispose();
        }
    }
}