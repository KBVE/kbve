using UnityEngine;
using System.Collections.Generic;


namespace KBVE.MMExtensions.Orchestrator.Core
{
    public interface INPCFactory
    {
        GameObject Create(string label, Vector3 position, Quaternion rotation);
        void Destroy(string label, GameObject npc);
    }

    public interface INPCGlobalController
    {
        void RegisterNPC(GameObject npc, string label);
        void UnregisterNPC(GameObject npc, string label);
    }

    public interface INPCMetadata
    {
        NPCDefinition Definition { get; }
        void Initialize(NPCDefinition definition);
    }

    public interface INPCDefinitionDatabase
    {
        NPCDefinition GetDefinitionByLabel(string label);
        List<string> GetAllLabels();
    }
}
