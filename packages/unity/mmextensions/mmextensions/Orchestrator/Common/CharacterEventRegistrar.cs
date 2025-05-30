using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;
using VContainer.Unity;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class CharacterEventRegistrar : IStartable,
                                           MMEventListener<TopDownEngineEvent>
    {
        private readonly ICharacterRegistry _registry;
        private const string PlayerID = "Player1";

        [Inject]
        public CharacterEventRegistrar(ICharacterRegistry registry)
        {
            _registry = registry;
        }

        public void Start()
        {
            MMEventManager.AddListener<TopDownEngineEvent>(this);
        }

        public void OnMMEvent(TopDownEngineEvent evt)
        {
            if (evt.EventType != TopDownEngineEventTypes.SpawnComplete)
                return;

            var character = evt.OriginCharacter;
            if (character == null)
            {
                Debug.LogWarning("[CharacterEventRegistrar] SpawnComplete event had null character.");
                return;
            }

            Debug.Log($"[CharacterEventRegistrar] SpawnComplete received. Character: {character.name}");

            if (!_registry.IsRegistered(PlayerID))
            {
                _registry.Register(PlayerID, character);
                Debug.Log($"[CharacterEventRegistrar] Registered Character '{character.name}' to PlayerID '{PlayerID}'");
            }

            // Inventory lookup (global search)
            var inventory = FindInventoryByPlayerID(PlayerID);
            if (inventory != null)
            {
                _registry.RegisterInventory(PlayerID, inventory);
                Debug.Log($"[CharacterEventRegistrar] Registered Inventory for PlayerID: {PlayerID}");
            }
            else
            {
                Debug.LogWarning($"[CharacterEventRegistrar] No Inventory found for PlayerID: {PlayerID}");
            }
        }

        private Inventory FindInventoryByPlayerID(string playerID)
        {
            foreach (var inv in UnityEngine.Object.FindObjectsByType<Inventory>(FindObjectsSortMode.None))
            {
                if (inv != null && inv.PlayerID == playerID)
                    return inv;
            }
            return null;
        }
    }
}
