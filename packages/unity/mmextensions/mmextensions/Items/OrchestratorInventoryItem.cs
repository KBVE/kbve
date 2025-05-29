using UnityEngine;
using MoreMountains.InventoryEngine;
using MoreMountains.TopDownEngine;
using KBVE.MMExtensions.Orchestrator.Health;
using KBVE.Kilonet.Networks;

#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace KBVE.MMExtensions.Items
{
    [CreateAssetMenu(fileName = "OrchestratorInventoryItem", menuName = "KBVE/Inventory/Orchestrator", order = 70)]
    public class OrchestratorInventoryItem : InventoryItem
    {
        [Header("Stat Modification")]
        public bool AffectHealth;
        public float HealthAmount;

        public bool AffectStat;
        public string StatName;
        public float StatAmount;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void unityBridge(string json);
#endif

        public override bool Use(string playerID)
        {
            Character character = TargetInventory(playerID).Owner.GetComponentInParent<Character>();
            if (character == null || !IsUsable)
                return false;

            var extendedHealth = character.GetComponent<ExtendedHealth>();
            if (extendedHealth == null)
            {
                Debug.LogWarning("[OrchestratorItem] ExtendedHealth not found.");
                return false;
            }

            if (AffectHealth && HealthAmount > 0)
            {
                extendedHealth.Heal(HealthAmount, character.gameObject);
            }

            if (AffectStat && !string.IsNullOrEmpty(StatName))
            {
                extendedHealth.ModifyStat(StatName, StatAmount);
            }

            NotifyUnityBridge(character.name);
            return true;
        }

        private void NotifyUnityBridge(string target)
        {
            var message = new
            {
                type = "orchestrator",
                status = "used",
                item = name,
                target
            };

            var protocol = new JSONProtocol();
            byte[] jsonBytes = protocol.Serialize(message);
            string json = System.Text.Encoding.UTF8.GetString(jsonBytes);

#if UNITY_WEBGL && !UNITY_EDITOR
            unityBridge(json);
#endif

            Debug.Log("[OrchestratorItem] " + json);
        }
    }
}
