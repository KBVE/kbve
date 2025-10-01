using System;
using Unity.Entities;
using Unity.Mathematics;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Defines the formation settings for a horde of minions in ECS.
    /// 
    /// Similar to <see cref="SquadSettings"/>, but used for enemy hordes.
    /// Stores grid resolution (rows × columns) and margin spacing so that
    /// systems can place and arrange minions in a formation.
    /// </summary>
    [Serializable]
    public struct HordeSettings : IComponentData, IEquatable<HordeSettings>
    {
        /// <summary>
        /// Extra spacing (X and Y) between minions in the horde formation.
        /// </summary>
        public float2 minionMargin;
        
        /// <summary>
        /// The grid resolution of the horde formation.
        /// X = number of columns, Y = number of rows.
        /// </summary>
        public int2 hordeResolution;

        /// <summary>
        /// Compares this <see cref="HordeSettings"/> with another instance.
        /// Returns true if both margin and resolution match.
        /// </summary>
        public bool Equals(HordeSettings compareOther)
        {
            return math.all(minionMargin == compareOther.minionMargin)
            && math.all(hordeResolution == compareOther.hordeResolution);
        }

        /// <inheritdoc />
        public override bool Equals(object obj) => obj is HordeSettings other && Equals(other);

        /// <summary>
        /// Generates a hash code (currently just uses base implementation).
        /// </summary>
        public override int GetHashCode()
        {
            uint2 f = math.asuint(minionMargin);
            uint2 i = (uint2)hordeResolution;
            return (int)math.hash(new uint4(f.x, f.y, i.x, i.y));
        }


        /// <inheritdoc />
        public static bool operator ==(HordeSettings a, HordeSettings b) => a.Equals(b);

        /// <inheritdoc />
        public static bool operator !=(HordeSettings a, HordeSettings b) => !a.Equals(b);
    }
}