using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;
using Unity.EditorCoroutines.Editor;
using System.IO;
using System.Collections;
using System.Collections.Generic;
using MoreMountains.InventoryEngine;
using MoreMountains.Tools;
using MoreMountains.Feedbacks;
using MoreMountains.TopDownEngine;
using KBVE.MMExtensions.Database;
using KBVE.MMExtensions.Items;
using KBVE.MMExtensions.Quests;
using Newtonsoft.Json;


namespace KBVE.MMExtensions.Database
{
    public class EditorQuestDB : EditorWindow
    {
        private const string ApiUrl = "https://kbve.com/api/questdb.json";
        private const string AchievementAssetFolder = "Assets/Dungeon/Data/QuestDB/";

        private const string BaseImageUrl = "https://kbve.com";
        private const string SpriteFolder = "Assets/Dungeon/Data/QuestDB/Sprites/";
        private const string PrefabFolder = "Assets/Dungeon/Data/QuestDB/Prefabs/";
        private const string AchievementDefinitionsFolder = "Assets/Dungeon/Data/QuestDB/Definitions/";

        [MenuItem("KBVE/Database/Sync QuestDB")]
        public static void SyncQuestDatabase()
        {
            EditorCoroutineUtility.StartCoroutineOwnerless(FetchAndGenerate());
        }

        private static IEnumerator FetchAndGenerate()
        {
            using UnityWebRequest request = UnityWebRequest.Get(ApiUrl);
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"Failed to fetch QuestDB: {request.error}");
                yield break;
            }

            var wrapper = JsonConvert.DeserializeObject<QuestListWrapper>(request.downloadHandler.text);

            Directory.CreateDirectory(AchievementAssetFolder);
            Directory.CreateDirectory(SpriteFolder);
            Directory.CreateDirectory(PrefabFolder);
            Directory.CreateDirectory(AchievementDefinitionsFolder);

            foreach (var quest in wrapper.quests)
            {

                if (!string.IsNullOrEmpty(quest.rewards?.steamAchievement?.iconAchieved))
                {
                    // Download and import the sprite first
                    yield return CreateQuestSprite(quest.rewards.steamAchievement.iconAchieved);
                }

                // CreateSteamAchievementAsset(quest);
                CreateMMQuestAsset(quest);
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("QuestDB sync complete.");
        }

        // === Helper Methods ===

        private static IEnumerator CreateQuestSprite(string iconAchievedPath)
        {
            string imageName = Path.GetFileName(iconAchievedPath);
            string addressableKey = Path.GetFileNameWithoutExtension(iconAchievedPath);
            string imageUrl = BaseImageUrl + iconAchievedPath;
            string localImagePath = Path.Combine(SpriteFolder, imageName);


            using (UnityWebRequest texRequest = UnityWebRequestTexture.GetTexture(imageUrl))
            {
                yield return texRequest.SendWebRequest();

                if (texRequest.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"Quest icon download failed: {imageUrl}");
                    yield break;
                }

                var texture = DownloadHandlerTexture.GetContent(texRequest);
                File.WriteAllBytes(localImagePath, texture.EncodeToPNG());
                Debug.Log($"Saved quest icon: {localImagePath}");
            }

            AssetDatabase.ImportAsset(localImagePath, ImportAssetOptions.ForceUpdate);

            TextureImporter importer = (TextureImporter)TextureImporter.GetAtPath(localImagePath);
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = 256;
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.spritePivot = new Vector2(0.5f, 0.5f);
            importer.SaveAndReimport();

            AddressableUtility.MakeAddressable(localImagePath, addressableKey, "QuestIcons");
        }

        // private static void CreateSteamAchievementAsset(QuestEntry quest)
        // {
        //     string assetPath = $"{AchievementAssetFolder}{quest.id}_Steam.asset";
        //     Achievement steamAchievement = AssetDatabase.LoadAssetAtPath<Achievement>(assetPath);

        //     if (steamAchievement == null)
        //     {
        //         steamAchievement = ScriptableObject.CreateInstance<Achievement>();
        //         AssetDatabase.CreateAsset(steamAchievement, assetPath);
        //     }

        //     steamAchievement.name = quest.title;
        //     steamAchievement.Id = quest.id;
        //     steamAchievement.Name = quest.title;
        //     steamAchievement.Description = quest.description;
        //     steamAchievement.Hidden = false;

        //     EditorUtility.SetDirty(steamAchievement);
        // }

        private static void CreateMMQuestAsset(QuestEntry quest)
        {
            string assetPath = $"{AchievementDefinitionsFolder}{quest.id}_MMQuest.asset";
            MMQuest mmQuest = AssetDatabase.LoadAssetAtPath<MMQuest>(assetPath);

            if (mmQuest == null)
            {
                mmQuest = ScriptableObject.CreateInstance<MMQuest>();
                AssetDatabase.CreateAsset(mmQuest, assetPath);
            }

            // === MMAchievement-like fields
            mmQuest.AchievementID = quest.id;
            mmQuest.Title = quest.title;
            mmQuest.Description = quest.description;
            mmQuest.UnlockedStatus = false;
            mmQuest.HiddenAchievement = quest.hidden;
            mmQuest.AchievementType = AchievementTypes.Simple; // or Progress if applicable
            mmQuest.ProgressTarget = quest.rewards?.steamAchievement?.maxValue > 1 ? (int)quest.rewards.steamAchievement.maxValue : 1;
            mmQuest.ProgressCurrent = 0;
            mmQuest.Points = 100; // arbitrary or future field?
            mmQuest.LockedImage = null;
            mmQuest.UnlockedImage = null;
            mmQuest.UnlockedSound = null;

            // === Quest-specific metadata
            mmQuest.Guid = quest.guid;
            mmQuest.Slug = quest.slug;
            mmQuest.IconName = quest.icon;
            mmQuest.Category = quest.category;
            mmQuest.Drafted = quest.drafted;
            mmQuest.Hidden = quest.hidden;
            mmQuest.Repeatable = quest.repeatable;
            mmQuest.LevelRequirement = quest.levelRequirement;

            // === Quest structure
            mmQuest.Objectives = quest.objectives ?? new();
            mmQuest.Triggers = quest.triggers ?? new();
            mmQuest.NextQuestId = quest.nextQuestId;

            // === Rewards
            if (quest.rewards != null)
            {
                mmQuest.ItemRewards = quest.rewards.items ?? new();
                mmQuest.Bonuses = quest.rewards.bonuses ?? new();
                mmQuest.CurrencyReward = quest.rewards.currency;
                mmQuest.SteamAchievement = quest.rewards.steamAchievement ?? new();
            }

            EditorUtility.SetDirty(mmQuest);
            AddressableUtility.MakeAddressable(assetPath, quest.id, "Quests");
        }

        // private static void CreateMMAchievementAsset(QuestEntry quest)
        // {
        //     string assetPath = $"{AchievementAssetFolder}{quest.id}_MM.asset";
        //     MMAchievement mmAchievement = AssetDatabase.LoadAssetAtPath<MMAchievement>(assetPath);

        //     if (mmAchievement == null)
        //     {
        //         mmAchievement = ScriptableObject.CreateInstance<MMAchievement>();
        //         AssetDatabase.CreateAsset(mmAchievement, assetPath);
        //     }

        //     mmAchievement.AchievementID = quest.id;
        //     mmAchievement.Title = quest.title;
        //     mmAchievement.Description = quest.description;
        //     mmAchievement.Unlocked = false;
        //     EditorUtility.SetDirty(mmAchievement);
        // }


        public static List<MMQuest> LoadedQuests;

        //loads the list of scriptableobjects of type MMQuest from the disk into the moremountains system
        public static void LoadCustomAchievements()
        {
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
}