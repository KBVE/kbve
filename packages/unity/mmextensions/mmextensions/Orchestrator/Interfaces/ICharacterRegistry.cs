namespace KBVE.MMExtensions.Orchestrator.Interfaces
{
    using MoreMountains.TopDownEngine;
    using MoreMountains.InventoryEngine;

    /// <summary>
    /// A service interface for registering and resolving Character and Inventory instances based on player ID.
    /// </summary>
    public interface ICharacterRegistry
    {
        /// <summary>
        /// Registers a Character instance for a given player ID.
        /// </summary>
        /// <param name="playerID">The unique identifier for the player.</param>
        /// <param name="character">The Character instance to associate.</param>
        void Register(string playerID, Character character);

        /// <summary>
        /// Unregisters the Character and Inventory associated with the given player ID.
        /// </summary>
        /// <param name="playerID">The unique identifier for the player.</param>
        void Unregister(string playerID);

        /// <summary>
        /// Gets the registered Character instance for the given player ID.
        /// </summary>
        /// <param name="playerID">The unique identifier for the player.</param>
        /// <returns>The Character if found and still alive; otherwise, null.</returns>
        Character GetCharacter(string playerID);

        /// <summary>
        /// Gets the Inventory component associated with the player ID, if available.
        /// </summary>
        /// <param name="playerID">The unique identifier for the player.</param>
        /// <returns>The Inventory instance if found and valid; otherwise, null.</returns>
        Inventory GetInventory(string playerID);

        /// <summary>
        /// Checks whether a Character is currently registered for the given player ID.
        /// </summary>
        /// <param name="playerID">The unique identifier for the player.</param>
        /// <returns>True if registered; otherwise, false.</returns>
        bool IsRegistered(string playerID);

        /// <summary>
        /// Optionally removes any stale references (e.g., destroyed GameObjects).
        /// </summary>
        void Cleanup();
        void RegisterInventory(string playerID, Inventory inventory);
  }
}
