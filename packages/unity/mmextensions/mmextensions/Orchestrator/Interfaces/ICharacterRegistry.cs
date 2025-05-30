namespace KBVE.MMExtensions.Orchestrator.Interfaces
{
    using MoreMountains.TopDownEngine;

    /// <summary>
    /// A service interface for registering and resolving Character instances based on player ID.
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
        /// Unregisters the Character associated with the given player ID.
        /// </summary>
        /// <param name="playerID">The unique identifier for the player.</param>
        void Unregister(string playerID);

        /// <summary>
        /// Gets the registered Character instance for the given player ID.
        /// </summary>
        /// <param name="playerID">The unique identifier for the player.</param>
        /// <returns>The Character if found; otherwise, null.</returns>
        Character GetCharacter(string playerID);

        /// <summary>
        /// Checks whether a Character is registered for the given player ID.
        /// </summary>
        bool IsRegistered(string playerID);
    }
}