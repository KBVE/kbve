using System.Collections.Generic;
using UnityEngine;

namespace KBVE.MMExtensions.Quests
{
    [CreateAssetMenu(menuName = "KBVE/Quests/QuestDB", fileName = "QuestDB")]
    public class QuestDB : ScriptableObject
    {
        public List<MMQuest> AllQuests = new();
    }
}