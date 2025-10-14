
using System;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Structure-specific data. Only present when entity is a Structure.
    /// Size: ~18 bytes
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct StructureBlit : IEquatable<StructureBlit>
    {
        public byte StructureType;          // 1 byte
        public byte Level;                  // 1 byte
        public int Health;                  // 4 bytes
        public int MaxHealth;               // 4 bytes
        public float ProductionRate;        // 4 bytes
        public float ProductionProgress;    // 4 bytes

        // ---- Equality ----
        public bool Equals(StructureBlit other)
        {
            return StructureType == other.StructureType
                && Level == other.Level
                && Health == other.Health
                && MaxHealth == other.MaxHealth
                && math.abs(ProductionRate - other.ProductionRate) < math.EPSILON
                && math.abs(ProductionProgress - other.ProductionProgress) < math.EPSILON;
        }

        public override bool Equals(object obj) => obj is StructureBlit o && Equals(o);

        public override int GetHashCode()
        {
            unsafe
            {
                unchecked
                {
                    int hash = StructureType * 16777619;
                    hash = (hash * 397) ^ Level;
                    hash = (hash * 397) ^ Health;
                    hash = (hash * 397) ^ MaxHealth;
                    hash = (hash * 397) ^ ProductionRate.GetHashCode();
                    hash = (hash * 397) ^ ProductionProgress.GetHashCode();
                    return hash;
                }
            }
        }

        public static bool operator ==(StructureBlit a, StructureBlit b) => a.Equals(b);
        public static bool operator !=(StructureBlit a, StructureBlit b) => !a.Equals(b);
    }

}