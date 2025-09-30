using Unity.Entities;
using Unity.Mathematics;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Factory configuration data for spawning entities.
    /// 
    /// Defines the parameters that a factory (spawner) system will use
    /// when instantiating new entities into the world. This matches the
    /// "Age-of-Sprites" style factory spawning pattern.
    /// </summary>
    public struct FactoryData : IComponentData
    {
        /// <summary>
        /// The prefab entity to instantiate when spawning new units.
        /// </summary>
        public Entity prefab;

        /// <summary>
        /// Number of entities to spawn per wave.
        /// </summary>
        public int count;

        /// <summary>
        /// Time interval (in seconds) between spawns/waves.
        /// </summary>
        public float duration;

        /// <summary>
        /// The world-space position (X, Y) where entities should be instantiated.
        /// </summary>
        public float2 instantiatePos;

        /// <summary>
        /// How many waves have already been spawned by this factory.
        /// Used for tracking progress over time.
        /// </summary>
        public int wavesSpawned;

        /// <summary>
        /// Maximum number of waves this factory is allowed to spawn.
        /// Once reached, the factory stops spawning new entities.
        /// </summary>
        public int maxWaves;
    }

    /// <summary>
    /// Timer component used for factory spawning logic.
    /// 
    /// Stores the countdown timer value (in seconds) used to decide
    /// when the next spawn should occur. Typically managed by the
    /// factory system in conjunction with FactoryData.
    /// </summary>
    public struct FactoryTimer : IComponentData
    {
        /// <summary>
        /// Current timer value (seconds remaining until next spawn).
        /// </summary>
        public float value;
    }
}
