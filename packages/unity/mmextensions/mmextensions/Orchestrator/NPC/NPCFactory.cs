using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class NPCFactory: INPCFactory
    {
        private readonly OrchestratorNPCGlobals orchestratorGlobals;
        private readonly NPCGlobalController npcController;

        public NPCFactory(
            OrchestratorNPCGlobals orchestratorGlobals,
            NPCGlobalController npcController)
        {
            this.orchestratorGlobals = orchestratorGlobals;
            this.npcController = npcController;
        }

        public GameObject Create(string label, Vector3 position, Quaternion rotation)
        {
            var npc = orchestratorGlobals.DeployNPC(label, position, rotation);
            if (npc != null)
            {
                npcController.RegisterNPC(npc, label);
            }
            return npc;
        }

        public void Destroy(string label, GameObject npc)
        {
            npcController.UnregisterNPC(npc, label);
            orchestratorGlobals.ReturnNPC(label, npc);
        }
    }
}
