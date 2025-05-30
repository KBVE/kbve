using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;
using VContainer.Unity;
using System.Collections.Generic;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class CharacterEventRegistrar : IStartable,
                                           MMEventListener<TopDownEngineEvent>,
                                           MMEventListener<MMInventoryEvent>
    {
        private readonly ICharacterRegistry _registry;
        private readonly Dictionary<string, Character> _pendingCharacters = new();
        private readonly HashSet<string> _inventoryLoaded = new();

        [Inject]
        public CharacterEventRegistrar(ICharacterRegistry registry)
        {
            _registry = registry;
        }

        public void Start()
        {
            MMEventManager.AddListener<TopDownEngineEvent>(this);
            MMEventManager.AddListener<MMInventoryEvent>(this);
        }

        public void OnMMEvent(TopDownEngineEvent evt)
        {
            if (evt.EventType == TopDownEngineEventTypes.SpawnComplete)
            {
                var character = evt.OriginCharacter;
                if (character == null)
                {
                    Debug.LogWarning("[CharacterEventRegistrar] SpawnComplete event had null character.");
                    return;
                }

                Debug.Log($"[CharacterEventRegistrar] SpawnComplete event received. Character: {character.name}");

                var playerID = FindMatchingPlayerID(character);
                if (!string.IsNullOrWhiteSpace(playerID))
                {
                    _pendingCharacters[playerID] = character;
                    Debug.Log($"[CharacterEventRegistrar] Matched Character '{character.name}' to PlayerID '{playerID}'");
                }
                else
                {
                    Debug.LogWarning($"[CharacterEventRegistrar] Could not find matching Inventory for Character '{character.name}'");
                }
            }
        }

        public void OnMMEvent(MMInventoryEvent evt)
        {
            if (evt.InventoryEventType != MMInventoryEventType.InventoryLoaded || string.IsNullOrWhiteSpace(evt.PlayerID))
                return;

            Debug.Log($"[CharacterEventRegistrar] InventoryLoaded received for PlayerID: {evt.PlayerID}");

            _inventoryLoaded.Add(evt.PlayerID);

            if (_pendingCharacters.TryGetValue(evt.PlayerID, out var character))
            {
                FinalizeRegistration(evt.PlayerID, character);
                _pendingCharacters.Remove(evt.PlayerID);
            }
            else
            {
                var inv = FindInventoryByPlayerID(evt.PlayerID);
                if (inv != null)
                {
                    Debug.Log($"[CharacterEventRegistrar] Registering inventory-only (no character yet) for PlayerID: {evt.PlayerID}");
                    _registry.RegisterInventory(evt.PlayerID, inv);
                }
            }
        }

        private void FinalizeRegistration(string playerID, Character character)
        {
            if (!_registry.IsRegistered(playerID))
            {
                _registry.Register(playerID, character);
                Debug.Log($"[CharacterEventRegistrar] Registered character {character.name} for PlayerID: {playerID}");
            }

            var inventory = FindInventoryByPlayerID(playerID);
            if (inventory != null)
            {
                _registry.RegisterInventory(playerID, inventory);
                Debug.Log($"[CharacterEventRegistrar] Registered inventory for PlayerID: {playerID}");
            }
            else
            {
                Debug.LogWarning($"[CharacterEventRegistrar] Inventory not found for PlayerID: {playerID}");
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

        private string FindMatchingPlayerID(Character character)
        {
            foreach (var inv in UnityEngine.Object.FindObjectsByType<Inventory>(FindObjectsSortMode.None))
            {
                if (inv == null || string.IsNullOrWhiteSpace(inv.PlayerID)) continue;

                // Heuristic match based on character and inventory naming conventions
                if (inv.name.ToLower().Contains(character.name.ToLower()) ||
                    character.name.ToLower().Contains(inv.name.ToLower()) ||
                    inv.PlayerID.ToLower().Contains("player")) // default fallback match
                {
                    return inv.PlayerID;
                }
            }

            return null;
        }
    }
}
