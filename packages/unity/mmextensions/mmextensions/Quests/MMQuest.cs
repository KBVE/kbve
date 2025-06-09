using UnityEngine;
using MoreMountains.Tools;
using KBVE.MMExtensions.Quests;
using System.Collections.Generic;
using System;

namespace KBVE.MMExtensions.Quests
{
    [CreateAssetMenu(menuName = "KBVE/Quests/MMQuest", fileName = "NewMMQuest")]
    public class MMQuest : ScriptableObject
    {
        [Header("Internal MM Achievement")]
        [SerializeField]
        private MMAchievement _achievement = new();

        [Header("Meta")]
        public string Guid;
        public string Slug;
        public string IconName;
        public string Category;
        public bool Drafted;
        public bool Hidden;
        public bool Repeatable;
        public int LevelRequirement;

        [Header("Quest Structure")]
        public List<ObjectiveEntry> Objectives = new();
        public List<string> Triggers = new();
        public string NextQuestId;

        [Header("Rewards")]
        public List<ItemReward> ItemRewards = new();
        public RewardBonuses Bonuses = new();
        public int CurrencyReward;

        [Header("Steam Achievement Link")]
        public SteamAchievementData SteamAchievement = new();
    

        // === MMAchievement Forwarded Properties ===
        public string AchievementID { get => _achievement.AchievementID; set => _achievement.AchievementID = value; }
        public string Title { get => _achievement.Title; set => _achievement.Title = value; }
        public string Description { get => _achievement.Description; set => _achievement.Description = value; }
        public bool UnlockedStatus { get => _achievement.UnlockedStatus; set => _achievement.UnlockedStatus = value; }
        public bool HiddenAchievement { get => _achievement.HiddenAchievement; set => _achievement.HiddenAchievement = value; }
        public AchievementTypes AchievementType { get => _achievement.AchievementType; set => _achievement.AchievementType = value; }
        public int ProgressTarget { get => _achievement.ProgressTarget; set => _achievement.ProgressTarget = value; }
        public int ProgressCurrent { get => _achievement.ProgressCurrent; set => _achievement.ProgressCurrent = value; }
        public int Points { get => _achievement.Points; set => _achievement.Points = value; }
        public Sprite LockedImage { get => _achievement.LockedImage; set => _achievement.LockedImage = value; }
        public Sprite UnlockedImage { get => _achievement.UnlockedImage; set => _achievement.UnlockedImage = value; }
        public AudioClip UnlockedSound { get => _achievement.UnlockedSound; set => _achievement.UnlockedSound = value; }

        // === MMAchievement Forwarded Methods ===
        public void UnlockAchievement() => _achievement.UnlockAchievement();
        public void LockAchievement() => _achievement.LockAchievement();
        public void SetProgress(int value) => _achievement.SetProgress(value);
        public void AddProgress(int value) => _achievement.AddProgress(value);
        public MMAchievement Copy() => _achievement.Copy();
        public void EvaluateProgress() => _achievement.GetType().GetMethod("EvaluateProgress", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.Invoke(_achievement, null);
   
        public MMAchievement ToMMAchievement()
        {
            return new MMAchievement
            {
                AchievementID = this.AchievementID,
                AchievementType = this.AchievementType,
                HiddenAchievement = this.HiddenAchievement,
                UnlockedStatus = this.UnlockedStatus,
                Title = this.Title,
                Description = this.Description,
                Points = this.Points,
                LockedImage = this.LockedImage,
                UnlockedImage = this.UnlockedImage,
                UnlockedSound = this.UnlockedSound,
                ProgressTarget = this.ProgressTarget,
                ProgressCurrent = this.ProgressCurrent
            };
        }
    }
}