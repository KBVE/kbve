using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Tag component to identify zombie entities - exact match to Age-of-Sprites pattern
    /// </summary>
    public struct ZombieTag : IComponentData
    {
    }

    /// <summary>
    /// Zombie health component - simple data following Age-of-Sprites pattern
    /// </summary>
    public struct ZombieHealth : IComponentData
    {
        public float value;
    }

    /// <summary>
    /// Zombie movement speed component - simple data following Age-of-Sprites pattern
    /// </summary>
    public struct ZombieSpeed : IComponentData
    {
        public float value;
    }

    /// <summary>
    /// Zombie movement direction - unique per zombie to prevent single-line behavior
    /// </summary>
    public struct ZombieDirection : IComponentData
    {
        public Unity.Mathematics.float2 value;
    }
}