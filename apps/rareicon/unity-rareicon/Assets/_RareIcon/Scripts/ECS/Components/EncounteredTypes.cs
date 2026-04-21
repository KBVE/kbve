using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Singleton bitmask of <see cref="UnitType"/> bytes the player has encountered. 128 bits = 4× uint slots; indexed by <c>typeByte</c> with <c>idx = typeByte/32</c> and <c>bit = 1u &lt;&lt; (typeByte%32)</c>. <see cref="FirstContactSystem"/> owns writes; read-only for anything else.</summary>
    public struct EncounteredTypes : IComponentData
    {
        public uint4 Mask;

        public bool IsSet(byte type)
        {
            int idx = type >> 5;
            uint bit = 1u << (type & 31);
            uint word = idx switch
            {
                0 => Mask.x,
                1 => Mask.y,
                2 => Mask.z,
                _ => Mask.w,
            };
            return (word & bit) != 0;
        }

        public void Set(byte type)
        {
            int idx = type >> 5;
            uint bit = 1u << (type & 31);
            switch (idx)
            {
                case 0: Mask.x |= bit; break;
                case 1: Mask.y |= bit; break;
                case 2: Mask.z |= bit; break;
                default: Mask.w |= bit; break;
            }
        }
    }
}
