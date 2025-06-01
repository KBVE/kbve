using System.Collections.Generic;
using UnityEngine;


namespace KBVE.MMExtensions.Orchestrator.Core
{
    public enum AIType
    {
        None,
        Passive,
        Aggressive,
        Friendly,
    }


    [System.Flags]
    public enum AIBehaviorFlags
    {
        None = 0,
        Patrol = 1 << 0,
        Chase = 1 << 1,
        Flee = 1 << 2,
        UseCover = 1 << 3,
        AlertOthers = 1 << 4,
        Idle = 1 << 5,
        Investigate = 1 << 6,
        RangeAttack = 1 << 7,
        MeleeAttack = 1 << 8,
        Guard = 1 << 9,
        Follow = 1 << 10,
    }

    public enum FactionType
    {
        Neutral,
        Player,
        Enemy,
        Ally
    }

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

    public class NPCMetadata : MonoBehaviour, INPCMetadata
    {
        public NPCDefinition Definition { get; private set; }

        public void Initialize(NPCDefinition definition)
        {
            Definition = definition;

            name = definition.displayName;
            var animator = GetComponent<Animator>();
            if (animator && definition.animator)
                animator.runtimeAnimatorController = definition.animator;

            // Cache other fields if needed (health, faction, etc.)
        }
    }

    [CreateAssetMenu(menuName = "KBVE/NPC Definition Database")]
    public class NPCDefinitionDatabase : ScriptableObject, INPCDefinitionDatabase
    {
        [SerializeField] private List<NPCDefinition> npcDefinitions;

        private Dictionary<string, NPCDefinition> _cache;

        private void OnEnable()
        {
            _cache = new Dictionary<string, NPCDefinition>();
            foreach (var def in npcDefinitions)
            {
                if (def != null && !_cache.ContainsKey(def.label))
                {
                    _cache[def.label] = def;
                }
            }
        }

        public NPCDefinition GetDefinitionByLabel(string label)
        {
            if (_cache == null || _cache.Count == 0)
                OnEnable();

            return _cache.TryGetValue(label, out var def) ? def : null;
        }

        public List<string> GetAllLabels()
        {
            if (_cache == null || _cache.Count == 0)
                OnEnable();

            return _cache.Keys.ToList(); // requires using System.Linq
        }
    }
}
