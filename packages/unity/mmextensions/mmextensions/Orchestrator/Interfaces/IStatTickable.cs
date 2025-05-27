namespace KBVE.MMExtensions.Orchestrator.Interfaces
{
    /// <summary>
    /// Interface for components that support stat ticking (e.g., mana regen, stamina regen).
    /// Registered into the global TickSystem.
    /// </summary>
    public interface IStatTickable
    {
        /// <summary>
        /// Called every tick cycle to update stat values.
        /// </summary>
        /// <param name="deltaTime">The time since the last tick (usually Time.fixedDeltaTime).</param>
        void Tick(float deltaTime);
    }
}