using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Factory data for spawning entities - exact match to Age-of-Sprites
    /// </summary>
    public struct FactoryData : IComponentData
    {
        public Entity prefab;
        public int count;
        public float duration;
        public float2 instantiatePos;
        public int wavesSpawned;
        public int maxWaves;
    }

    /// <summary>
    /// Timer component for factory spawning - exact match to Age-of-Sprites
    /// </summary>
    public struct FactoryTimer : IComponentData
    {
        public float value;
    }
}