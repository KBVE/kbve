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
using MoreMountains.Feedbacks;
using KBVE.MMExtensions.Quests;
using Achievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;

// TODO: Notes
//JD NOTE: does not reference scriptableObject list (loaded with scriptableobjects present in repo)
//JD NOTE: untested achievement events

namespace KBVE.MMExtensions.SSDB.Steam
{
    public class SteamAchievements : MonoBehaviour, IAsyncStartable, IDisposable, MMEventListener<MMAchievementUnlockedEvent>
    {
        private const string AchievementAssetFolder = "Assets/Dungeon/Data/QuestDB/";

        private const string BaseImageUrl = "https://kbve.com";
        private const string SpriteFolder = "Assets/Dungeon/Data/QuestDB/Sprites/";
        private const string PrefabFolder = "Assets/Dungeon/Data/QuestDB/Prefabs/";
        private const string AchievementDefinitionsFolder = "Assets/Dungeon/Data/QuestDB/Definitions/";
        private const string QuestDBAssetPath = "Assets/Dungeon/Data/QuestDB/Definitions/QuestDB.asset";
        
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
                InitializeAchievementsList();
                await UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: cancellationToken);
                MMEventManager.AddListener<MMAchievementUnlockedEvent>(this);
            }
            catch (OperationCanceledException)
            {
            // MMQuest questFound = EditorQuestDB.LoadedQuests.FirstOrDefault(a => a.AchievementID != null
            //     && a.AchievementID == eventType.Achievement.AchievementID);

            // if (questFound == null)
            // {
            //     Debug.LogError("[Steam Achievement Failed] MMQuest not found in loaded quests list");
            //     return;
            // }

            // UnlockOnSteam(questFound);
            // Load all MMQuest assets from Assets/MMAchievements/
            string[] guids = AssetDatabase.FindAssets("t:MMQuest", new[] { AchievementAssetFolder });
            List<MMAchievement> achievements = new List<MMAchievement>();

            LoadedQuests = new List<MMQuest>();
            foreach (string guid in guids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                MMQuest quest = AssetDatabase.LoadAssetAtPath<MMQuest>(path);
                if (quest != null)
                {
                    achievements.Add(quest.ToMMAchievement());
                    LoadedQuests.Add(GameObject.Instantiate(quest));
                    //achievements.Add(Object.Instantiate(quest)); // clone to avoid modifying asset directly
                }
            }

            // Create MMAchievementList in memory
            MMAchievementList list = ScriptableObject.CreateInstance<MMAchievementList>();
            list.AchievementsListID = "CustomStartupAchievements";
            list.Achievements = achievements;

            MMAchievementManager.LoadAchievementList(list);
            // Inject into MMAchievementManager
            // typeof(MMAchievementManager)
            //     .GetField("_achievementList", BindingFlags.NonPublic | BindingFlags.Static)
            //     ?.SetValue(null, list);

            // Load progress from disk (optional) (saved progress on disk towards achievements?)
            MMAchievementManager.LoadSavedAchievements();
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
