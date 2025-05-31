using System.Collections.Generic;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class OrchestratorCharacterData : ICharacterRegistry
    {
        private readonly Dictionary<string, List<Character>> _characterMap = new();
        private readonly Dictionary<string, Character> _primaryCharacterMap = new();
        private readonly Dictionary<string, Inventory> _inventoryMap = new();

        public void Register(string playerID, Character character)
        {
            if (string.IsNullOrEmpty(playerID) || character == null) return;

            if (!_characterMap.TryGetValue(playerID, out var list))
            {
                list = new List<Character>();
                _characterMap[playerID] = list;
            }

            if (!list.Contains(character))
            {
                list.Add(character);
            }

            // If there's no primary yet, or the current one is null/destroyed, assign this
            if (!_primaryCharacterMap.ContainsKey(playerID) || _primaryCharacterMap[playerID] == null)
            {
                _primaryCharacterMap[playerID] = character;
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
            _primaryCharacterMap.Remove(playerID);
            _inventoryMap.Remove(playerID);
        }

        public Character GetCharacter(string playerID)
        {
            return _primaryCharacterMap.TryGetValue(playerID, out var character) && character != null
                ? character
                : null;
        }

        public IEnumerable<Character> GetAllCharacters(string playerID)
        {
            return _characterMap.TryGetValue(playerID, out var list) ? list : new List<Character>();
        }

        public Inventory GetInventory(string playerID)
        {
            return _inventoryMap.TryGetValue(playerID, out var inventory) && inventory != null
                ? inventory
                : null;
        }

        public bool IsRegistered(string playerID)
        {
            return _primaryCharacterMap.ContainsKey(playerID) && _primaryCharacterMap[playerID] != null;
        }

        public bool HasCharacter(string playerID, Character character)
        {
            return _characterMap.TryGetValue(playerID, out var list) && list.Contains(character);
        }

        public bool TryGetPrimaryCharacter(string playerID, out Character character)
        {
            character = GetCharacter(playerID);
            return character != null;
        }

        public bool TryGetInventory(string playerID, out Inventory inventory)
        {
            inventory = GetInventory(playerID);
            return inventory != null;
        }

        public bool TryGetCharacters(string playerID, out List<Character> characters)
{
            if (_characterMap.TryGetValue(playerID, out var list))
            {
                characters = list;
                return true;
            }

            characters = null;
            return false;
        }



        public void SetPrimaryCharacter(string playerID, Character character)
        {
            if (HasCharacter(playerID, character))
            {
                _primaryCharacterMap[playerID] = character;
            }
        }

        public void Cleanup()
        {
            var staleKeys = new List<string>();

            foreach (var kvp in _characterMap)
            {
                kvp.Value.RemoveAll(c => c == null);
                if (kvp.Value.Count == 0)
                {
                    staleKeys.Add(kvp.Key);
                }
            }

            foreach (var key in staleKeys)
            {
                _characterMap.Remove(key);
                _primaryCharacterMap.Remove(key);
                _inventoryMap.Remove(key);
            }
        }
    }
}
