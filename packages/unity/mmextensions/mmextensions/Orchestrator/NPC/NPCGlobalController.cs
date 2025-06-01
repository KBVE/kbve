using System.Collections.Generic;
using UnityEngine;


namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class NPCGlobalController: INPCGlobalController
    {
        private readonly Dictionary<string, List<GameObject>> activeNPCMap = new();
        private readonly NPCDefinitionDatabase npcDefinitionDatabase;

        public NPCGlobalController(NPCDefinitionDatabase npcDefinitionDatabase)
        {
            this.npcDefinitionDatabase = npcDefinitionDatabase;
        }

        public void RegisterNPC(GameObject npc, string label)
        {
            if (!activeNPCMap.ContainsKey(label))
                activeNPCMap[label] = new List<GameObject>();

            activeNPCMap[label].Add(npc);

            var definition = npcDefinitionDatabase.GetDefinitionByLabel(label);
            if (definition == null)
            {
                Debug.LogWarning($"[NPCGlobalController] No NPCDefinition found for label: {label}");
                return;
            }

            // Attach metadata
            var metadata = npc.GetComponent<NPCMetadata>();
            if (metadata == null)
                metadata = npc.AddComponent<NPCMetadata>();

            metadata.Initialize(definition);

            AttachBehavior(metadata, definition);  // Optional: attach AI or behaviors

        }

        public void UnregisterNPC(GameObject npc, string label)
        {
            if (activeNPCMap.TryGetValue(label, out var list))
            {
                list.Remove(npc);
            }
        }

        private void AttachBehavior(NPCMetadata metadata, NPCDefinition definition)
        {
            switch (definition.aiType)
            {
                default:
                    break;
                case AIType.Passive:
                    // metadata.gameObject.AddComponent<PassiveNPCBrain>();
                    break;
                case AIType.Aggressive:
                    //metadata.gameObject.AddComponent<AggressiveNPCBrain>();
                    break;
                // TODO: Ai Migration + Add more Ai cases here
            }
        }
    }
}