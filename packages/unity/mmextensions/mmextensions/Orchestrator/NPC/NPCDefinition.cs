using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    [CreateAssetMenu(menuName = "KBVE/NPC Definition")]
    public class NPCDefinition : ScriptableObject
    {
        public string label;
        public string displayName;
        public GameObject prefab;
        public FactionType faction;
        public float health;
        public float speed;
        public AIType aiType;
        public AIBehaviorFlags behaviorFlags;
        public RuntimeAnimatorController animator;
    }
}