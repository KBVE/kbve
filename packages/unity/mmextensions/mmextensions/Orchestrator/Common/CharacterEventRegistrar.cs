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
        // private const string PlayerID = "Player1"; - Removing the hardcoded ref to player1.

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
             switch (evt.EventType)
            {
                case TopDownEngineEventTypes.SpawnComplete:
                    HandleSpawnComplete(evt);
                    break;

                case TopDownEngineEventTypes.LevelStart:
                    // TODO: Scan all the characters.
                    break;

                case TopDownEngineEventTypes.CharacterSwap:
                    // TODO: Swap the UI for Avatar, Health and Stats.
                    break;
                default:
                    break;
            }
        }


        private void HandleSpawnComplete(TopDownEngineEvent evt)
        {
            var character = evt.OriginCharacter;
            if (character == null)
            {
                Debug.LogWarning("[CharacterEventRegistrar] SpawnComplete event had null origin character.");
                return;
            }

            var swap = character.GetComponent<CharacterSwap>();
            string playerID;

            if (swap != null && !string.IsNullOrWhiteSpace(swap.PlayerID))
            {
                playerID = swap.PlayerID;
            }
            else
            {
                Debug.LogError($"[CharacterEventRegistrar] Character '{character.name}' is missing a valid CharacterSwap.PlayerID. Falling back to 'Player1'.");
                playerID = "Player1";
            }

            Debug.Log($"[CharacterEventRegistrar] SpawnComplete received. Character: {character.name} (PlayerID: {playerID})");

            // Register the character (even if multiple for same PlayerID)
            _registry.Register(playerID, character);
            Debug.Log($"[CharacterEventRegistrar] Registered Character '{character.name}' to PlayerID '{playerID}'");

            // Only register inventory if not already present
            if (!_registry.TryGetInventory(playerID, out _))
            {
                var inventory = FindInventoryByPlayerID(playerID);
                if (inventory != null)
                {
                    _registry.RegisterInventory(playerID, inventory);
                    Debug.Log($"[CharacterEventRegistrar] Registered Inventory for PlayerID: {playerID}");
                }
                else
                {
                    Debug.LogWarning($"[CharacterEventRegistrar] No Inventory found for PlayerID: {playerID}");
                }
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
