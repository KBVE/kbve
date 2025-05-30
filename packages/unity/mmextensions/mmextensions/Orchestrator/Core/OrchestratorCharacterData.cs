using System.Collections.Generic;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.TopDownEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class OrchestratorCharacterData : ICharacterRegistry
    {
        private readonly Dictionary<string, Character> _characterMap = new();

        public void Register(string playerID, Character character)
        {
            if (!string.IsNullOrEmpty(playerID) && character != null)
            {
                _characterMap[playerID] = character;
            }
        }

        public void Unregister(string playerID)
        {
            _characterMap.Remove(playerID);
        }

        public Character GetCharacter(string playerID)
        {
            return _characterMap.TryGetValue(playerID, out var character) ? character : null;
        }

        public bool IsRegistered(string playerID)
        {
            return _characterMap.ContainsKey(playerID);
        }
    }
}
