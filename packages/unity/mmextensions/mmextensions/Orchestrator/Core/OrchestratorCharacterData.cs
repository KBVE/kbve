using System.Collections.Generic;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class OrchestratorCharacterData : ICharacterRegistry
    {
        private readonly Dictionary<string, Character> _characterMap = new();
        private readonly Dictionary<string, Inventory> _inventoryMap = new();

        public void Register(string playerID, Character character)
        {
            if (!string.IsNullOrEmpty(playerID) && character != null)
            {
                _characterMap[playerID] = character;
            }
        }

        public void RegisterInventory(string playerID, Inventory inventory)
        {
            if (!string.IsNullOrEmpty(playerID) && inventory != null)
            {
                _inventoryMap[playerID] = inventory;
            }
        }

        public void Unregister(string playerID)
        {
            _characterMap.Remove(playerID);
            _inventoryMap.Remove(playerID);
        }

        public Character GetCharacter(string playerID)
        {
            return _characterMap.TryGetValue(playerID, out var character) && character != null
                ? character
                : null;
        }

        public Inventory GetInventory(string playerID)
        {
            return _inventoryMap.TryGetValue(playerID, out var inventory) && inventory != null
                ? inventory
                : null;
        }

        public bool IsRegistered(string playerID)
        {
            return _characterMap.ContainsKey(playerID) && _characterMap[playerID] != null;
        }

        public void Cleanup()
        {
            // Remove any entries with null references
            var staleKeys = new List<string>();

            foreach (var kvp in _characterMap)
            {
                if (kvp.Value == null)
                {
                    staleKeys.Add(kvp.Key);
                }
            }

            foreach (var key in staleKeys)
            {
                _characterMap.Remove(key);
                _inventoryMap.Remove(key);
            }
        }
    }
}
