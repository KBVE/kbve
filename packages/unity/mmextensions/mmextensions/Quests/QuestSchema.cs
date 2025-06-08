using System;
using System.Collections.Generic;

namespace KBVE.MMExtensions.Quests
{

    [Serializable]
    public class QuestListWrapper
    {
        public List<QuestEntry> quests;
        public Dictionary<string, int> key;
    }

    [Serializable]
    public class QuestEntry
    {
        public string id;
        public string guid;
        public bool drafted;
        public string title;
        public string description;
        public string icon;
        public string category;
        public bool hidden;
        public bool repeatable;
        public int levelRequirement;
        public List<ObjectiveEntry> objectives;
        public Reward rewards;
        public List<string> triggers;
        public string nextQuestId;
        public string slug;
    }

    [Serializable]
    public class ObjectiveEntry
    {
        public string description;
        public string type;
        public List<string> targetRefs;
        public int requiredAmount;
    }

    [Serializable]
    public class Reward
    {
        public List<ItemReward> items;
        public RewardBonuses bonuses;
        public SteamAchievementData steamAchievement;
        public int currency;
    }

    [Serializable]
    public class ItemReward
    {
        public string @ref;
        public int amount;
    }

    [Serializable]
    public class RewardBonuses
    {
        public float cookingSpeed;
        public float recipeDiscovery;
    }

    [Serializable]
    public class SteamAchievementData
    {
        public string apiName;
        public string name;
        public string description;
        public string iconAchieved;
        public string iconUnachieved;
        public float globalPercent;
        public bool hidden;
        public float minValue;
        public float maxValue;
    }

}