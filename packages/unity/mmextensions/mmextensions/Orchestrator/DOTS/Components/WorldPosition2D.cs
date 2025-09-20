using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// 2D world position component for sprite rendering
    /// Based on Age-of-Sprites pattern for NSprites compatibility
    /// </summary>
    public struct WorldPosition2D : IComponentData
    {
        public float2 Value;

        public WorldPosition2D(in float3 pos) => Value = new float2(pos.x, pos.z);
    }

    /// <summary>
    /// Previous 2D world position for interpolation/smoothing
    /// </summary>
    public struct PrevWorldPosition2D : IComponentData
    {
        public float2 value;
    }
}