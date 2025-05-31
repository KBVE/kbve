using UnityEngine;
using MoreMountains.InventoryEngine;
using MoreMountains.TopDownEngine;
using KBVE.MMExtensions.Orchestrator.Health;
using KBVE.MMExtensions.Orchestrator;
using KBVE.Kilonet.Networks;
using Cysharp.Threading.Tasks;


#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace KBVE.MMExtensions.Items
{

    [System.Serializable]
    public class StatBonuses
    {
        public float health;
        public float cookingSpeed;
        public float foodQuality;
        public bool recipeDiscovery;
        public Dictionary<string, float> extra = new();         // Future-proofing: supports other dynamic stats (not yet typed)

    }

    [CreateAssetMenu(fileName = "OrchestratorInventoryItem", menuName = "KBVE/Inventory/Orchestrator", order = 70)]
    public class OrchestratorInventoryItem : InventoryItem
    {
        [Header("Stat Modification")]
        public StatBonuses Bonuses = new();

        public bool AffectHealth;
        public float HealthAmount;

        public bool AffectStat;
        public string StatName;
        public float StatAmount;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void unityBridge(string json);
#endif

        public override bool Pick(string playerID)
        {
            Operator.Toast.EnqueueToast($"Picked up {ItemName}", Orchestrator.Core.ToastType.Info, 2.5f);
            return base.Pick(playerID);
        }

        public override bool Equip(string playerID)
        {
            Operator.Toast.EnqueueToast($"Can not equip {ItemName}", Orchestrator.Core.ToastType.Warning, 2.5f);
            return false;
        }

        public override bool Use(string playerID)
        {
            // Character character = TargetInventory(playerID).Owner.GetComponentInParent<Character>();
            // Operator
            Character character = null;

            try
            {
                if (Operator.Registry != null)
                {
                    character = Operator.Registry.GetCharacter(playerID);

                    if (character == null)
                    {
                        Debug.LogWarning($"[OrchestratorItem] Operator.Registry returned null for PlayerID '{playerID}'. Attempting fallback...");
                    }
                }
                else
                {
                    Debug.LogWarning("[OrchestratorItem] Operator.Registry is not initialized. Attempting fallback...");
                }
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[OrchestratorItem] Exception during GetCharacter: {ex.Message}");
            }

            if (character == null) // Fallback if character is still null

            {
                try
                {
                    var inventory = TargetInventory(playerID);
                    if (inventory != null && inventory.Owner != null)
                    {
                        character = inventory.Owner.GetComponentInParent<Character>();
                        if (character != null)
                        {
                            Debug.Log($"[OrchestratorItem] Fallback character resolved from inventory: {character.name}");
                        }
                    }
                }
                catch (System.Exception fallbackEx)
                {
                    Debug.LogError($"[OrchestratorItem] Fallback character resolution failed: {fallbackEx.Message}");
                    return false;
                }
            }


            if (character == null || !IsUsable)
            {
                Operator.Toast.EnqueueToast($"Unable to use {ItemName}.", Orchestrator.Core.ToastType.Error, 2.5f);
                return false;
            }
            var extendedHealth = character.GetComponent<ExtendedHealth>();
            if (extendedHealth == null)
            {
                Debug.LogWarning("[OrchestratorItem] ExtendedHealth not found.");
                return false;
            }

            if (AffectHealth && HealthAmount > 0)
            {
                extendedHealth.Heal(HealthAmount, character.gameObject);
                Operator.Toast.EnqueueToast($"+{HealthAmount} from {ItemName}.", Orchestrator.Core.ToastType.Success, 2.5f);

            }

            _ = UniTask.Run(async () =>
            {
                try { await ApplyBonusesAsync(character); }
                catch (Exception ex) { Debug.LogError($"[Bonus] Error applying bonuses: {ex.Message}"); }
            });

            // if (AffectStat && !string.IsNullOrEmpty(StatName))
            // {
            //     extendedHealth.ModifyStat(StatName, StatAmount);
            //     if (StatAmount <= 0)
            //     {
            //         Operator.Toast.EnqueueToast($"{StatName} modified by {StatAmount} from {ItemName}.", Orchestrator.Core.ToastType.Warning, 2.5f);
            //     }
            //     else
            //     {
            //         Operator.Toast.EnqueueToast($"{StatName} modified by {StatAmount} from {ItemName}.", Orchestrator.Core.ToastType.Info, 2.5f);

            //     }

            // }


            Operator.Toast.EnqueueToast($"Just used {ItemName}.", Orchestrator.Core.ToastType.Success, 2.5f);
            NotifyUnityBridge(ItemID);
            return true;
        }


        public async UniTask<bool> ApplyBonusesAsync(Character character)
        {
            if (character == null)
            {
                Debug.LogWarning("[OrchestratorItem] Cannot apply bonuses: Character is null.");
                return false;
            }

            var extendedHealth = character.GetComponent<ExtendedHealth>();
            if (extendedHealth == null)
            {
                Debug.LogWarning("[OrchestratorItem] ExtendedHealth not found.");
                return false;
            }

            if (Bonuses.cookingSpeed != 0)
            {
                extendedHealth.ModifyStat("cookingSpeed", Bonuses.cookingSpeed);
                await UniTask.Yield();
            }

            if (Bonuses.foodQuality != 0)
            {
                extendedHealth.ModifyStat("foodQuality", Bonuses.foodQuality);
                await UniTask.Yield();
            }

            if (Bonuses.recipeDiscovery)
            {
                extendedHealth.ModifyStat("recipeDiscovery", 1f);
                await UniTask.Yield();
            }

            if (Bonuses.extra != null)
            {
                foreach (var kv in Bonuses.extra)
                {
                    if (kv.Value is float f)
                    {
                        extendedHealth.ModifyStat(kv.Key, f);
                    }
                    else if (float.TryParse(kv.Value.ToString(), out float parsed))
                    {
                        extendedHealth.ModifyStat(kv.Key, parsed);
                    }
                    await UniTask.Yield();
                }
            }

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
