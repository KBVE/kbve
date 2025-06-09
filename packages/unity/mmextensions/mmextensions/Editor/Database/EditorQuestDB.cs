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
        // === Remote & API Configuration ===
        private const string ApiUrl = "https://kbve.com/api/questdb.json";
        private const string BaseImageUrl = "https://kbve.com";

        // Base folder for all quest data
        private const string BaseQuestDataFolder = "Assets/Dungeon/Data/QuestDB/";

        // Subfolders
        private const string AchievementAssetFolder = BaseQuestDataFolder;
        private const string SpriteFolder = BaseQuestDataFolder + "Sprites/";
        private const string PrefabFolder = BaseQuestDataFolder + "Prefabs/";
        private const string AchievementDefinitionsFolder = BaseQuestDataFolder + "Definitions/";

        // Specific asset paths
        private const string QuestDBAssetPath = AchievementDefinitionsFolder + "QuestDB.asset";
        private const string AchievementListAssetPath = AchievementDefinitionsFolder + "MMAchievementList.asset";
        private const string AddressableGroup_Quests = "Quests";
        private const string AddressableGroup_Icons = "QuestIcons";
        private const string AddressableGroup_Database = "QuestDatabase";


        [MenuItem("KBVE/Database/Sync QuestDB")]
        public static void SyncQuestDatabase()
        {
            EditorCoroutineUtility.StartCoroutineOwnerless(FetchAndGenerate());
        }

        private static IEnumerator FetchAndGenerate()
        {

            ClearOldQuestAssets();
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

            var createdQuests = new List<MMQuest>();
            int total = wrapper.quests.Count;
            try
            {
                for (int i = 0; i < total; i++)
                {

                    var quest = wrapper.quests[i];

                    EditorUtility.DisplayProgressBar(
                        "Syncing QuestDB",
                        $"Processing quest {quest.title} ({i + 1}/{total})",
                        (float)i / total
                    );

                    if (!string.IsNullOrEmpty(quest.rewards?.steamAchievement?.iconAchieved))
                    {
                        yield return CreateQuestSprite(quest.rewards.steamAchievement.iconAchieved);
                    }
                    try
                    {
                        CreateMMQuestAsset(quest);

                        string assetPath = $"{AchievementDefinitionsFolder}{quest.id}_MMQuest.asset";
                        var mmQuest = AssetDatabase.LoadAssetAtPath<MMQuest>(assetPath);
                        if (mmQuest != null)
                        {
                            createdQuests.Add(mmQuest);
                        }
                    }
                    catch (System.Exception ex)
                    {
                        Debug.LogError($"[Quest Sync Error] Failed to process quest '{quest.title}' ({quest.id}): {ex.Message}");
                    }
                }
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }

            createdQuests.Sort((a, b) => string.Compare(a.Title, b.Title, System.StringComparison.OrdinalIgnoreCase));
            CreateOrUpdateQuestDB(createdQuests);

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log($"QuestDB sync complete. {createdQuests.Count} quests created and added to QuestDB.");
        }

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


        private static void CreateMMQuestAsset(QuestEntry quest)
        {
            string assetPath = $"{AchievementDefinitionsFolder}{quest.id}_MMQuest.asset";
            MMQuest mmQuest = AssetDatabase.LoadAssetAtPath<MMQuest>(assetPath);

            if (mmQuest == null)
            {
                mmQuest = ScriptableObject.CreateInstance<MMQuest>();
                AssetDatabase.CreateAsset(mmQuest, assetPath);
            }
            mmQuest.AchievementID = quest.id;
            mmQuest.Title = quest.title;
            mmQuest.Description = quest.description;
            mmQuest.UnlockedStatus = false;
            mmQuest.HiddenAchievement = quest.hidden;
            mmQuest.AchievementType = AchievementTypes.Simple;
            mmQuest.ProgressTarget = quest.rewards?.steamAchievement?.maxValue > 1 ? (int)quest.rewards.steamAchievement.maxValue : 1;
            mmQuest.ProgressCurrent = 0;
            mmQuest.Points = 100;
            mmQuest.LockedImage = null;
            mmQuest.UnlockedImage = null;
            mmQuest.UnlockedSound = null;

            mmQuest.Guid = quest.guid;
            mmQuest.Slug = quest.slug;
            mmQuest.IconName = quest.icon;
            mmQuest.Category = quest.category;
            mmQuest.Drafted = quest.drafted;
            mmQuest.Hidden = quest.hidden;
            mmQuest.Repeatable = quest.repeatable;
            mmQuest.LevelRequirement = quest.levelRequirement;

            mmQuest.Objectives = quest.objectives ?? new();
            mmQuest.Triggers = quest.triggers ?? new();
            mmQuest.NextQuestId = quest.nextQuestId;

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


        private static void CreateOrUpdateQuestDB(List<MMQuest> quests)
        {
            QuestDB questDB = AssetDatabase.LoadAssetAtPath<QuestDB>(QuestDBAssetPath);
            if (questDB == null)
            {
                questDB = ScriptableObject.CreateInstance<QuestDB>();
                AssetDatabase.CreateAsset(questDB, QuestDBAssetPath);
            }

            questDB.AllQuests = quests;
            EditorUtility.SetDirty(questDB);

            AddressableUtility.MakeAddressable(QuestDBAssetPath, "QuestDB", "QuestDatabase");
        }


        private static void ClearOldQuestAssets()
        {
            string[] existingFiles = Directory.GetFiles(AchievementDefinitionsFolder, "*.asset");

            foreach (var file in existingFiles)
            {
                string unityPath = file.Replace("\\", "/"); // Normalize slashes
                if (unityPath.StartsWith(Application.dataPath))
                {
                    unityPath = "Assets" + unityPath.Substring(Application.dataPath.Length);
                }

                AssetDatabase.DeleteAsset(unityPath);
            }
        }

        private static void CreateOrUpdateMMAchievementList(List<MMQuest> quests)
        {
            var achievementList = ScriptableObject.CreateInstance<MMAchievementList>();
            achievementList.AchievementsListID = "QuestAchievements";
            achievementList.Achievements = quests.ConvertAll(q => q.ToMMAchievement());

            if (File.Exists(AchievementListAssetPath))
            {
                AssetDatabase.DeleteAsset(AchievementListAssetPath);
            }

            AssetDatabase.CreateAsset(achievementList, AchievementListAssetPath);
            EditorUtility.SetDirty(achievementList);
            AddressableUtility.MakeAddressable(AchievementListAssetPath, "MMAchievementList", AddressableGroup_Database);
        }



    }
}