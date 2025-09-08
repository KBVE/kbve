using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    /// <summary>
    /// Interface for NPC definition database that provides NPC configuration data
    /// </summary>
    public interface INPCDefinitionDatabase
    {
        NPCDefinition GetDefinitionByLabel(string label);
        List<string> GetAllLabels();
    }

    [CreateAssetMenu(menuName = "KBVE/NPC/NPC Definition Database")]
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