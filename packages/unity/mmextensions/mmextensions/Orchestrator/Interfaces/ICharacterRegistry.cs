namespace KBVE.MMExtensions.Orchestrator.Interfaces
{
    using MoreMountains.TopDownEngine;
    using MoreMountains.InventoryEngine;
    using System.Collections.Generic;

    /// <summary>
    /// A service interface for registering and resolving Character and Inventory instances based on player ID.
    /// Supports multiple characters per player and handles inventory registration.
    /// </summary>
    public interface ICharacterRegistry
    {
        void Register(string playerID, Character character);
        void RegisterInventory(string playerID, Inventory inventory);
        void Unregister(string playerID);
        Character GetCharacter(string playerID); // Returns the primary character
        Inventory GetInventory(string playerID);
        IEnumerable<Character> GetAllCharacters(string playerID);

        bool IsRegistered(string playerID);
        bool HasCharacter(string playerID, Character character);

        bool TryGetPrimaryCharacter(string playerID, out Character character);
        bool TryGetInventory(string playerID, out Inventory inventory);

        void SetPrimaryCharacter(string playerID, Character character);

        void Cleanup();
    }
}
