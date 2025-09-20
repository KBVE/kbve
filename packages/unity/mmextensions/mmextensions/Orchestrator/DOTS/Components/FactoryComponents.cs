using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Factory data for spawning entities at regular intervals
    /// Based on Age-of-Sprites FactoryData pattern
    /// </summary>
    public struct FactoryData : IComponentData
    {
        public Entity prefab;
        public float2 instantiatePos;
        public int count;
        public float duration;
    }

    /// <summary>
    /// Timer component for factory spawning
    /// Based on Age-of-Sprites FactoryTimer pattern
    /// </summary>
    public struct FactoryTimer : IComponentData
    {
        public float value;
    }

    /// <summary>
    /// Tag component to identify cave spawners
    /// </summary>
    public struct CaveSpawnerTag : IComponentData
    {
    }
}