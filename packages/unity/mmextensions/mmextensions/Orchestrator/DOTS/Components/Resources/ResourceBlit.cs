using System;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Resource-specific data. Only present when entity is a Resource.
    /// Size: ~28 bytes
    /// Note: Ulid and WorldPos are provided by EntityBlit (no duplication)
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct ResourceBlit : IEquatable<ResourceBlit>
    {
        public FixedBytes16 TemplateUlid; // 16 bytes - Template ULID - static &&ref
        public byte Type;               // 1 byte - Wood, Stone, Metal, Food
        public byte Flags;              // 1 byte - IsHarvestable, IsDepleted
        public ushort Amount;           // 2 bytes - Current amount
        public ushort MaxAmount;        // 2 bytes - Maximum capacity
        public ushort HarvestYield;     // 2 bytes - Harvest yield amount
        public float HarvestTime;       // 4 bytes - Time required to harvest

        // ---- Equality ----
        public bool Equals(ResourceBlit other)
        {
            return
                TemplateUlid.Equals(other.TemplateUlid)
                && Type == other.Type
                && Flags == other.Flags
                && Amount == other.Amount
                && MaxAmount == other.MaxAmount
                && HarvestYield == other.HarvestYield
                && math.abs(HarvestTime - other.HarvestTime) < math.EPSILON;
        }

        public override bool Equals(object obj) => obj is ResourceBlit o && Equals(o);

        public override int GetHashCode()
        {
            unsafe
            {
                unchecked
                {
                    long h0, h1; // vector of half & half
                    fixed (FixedBytes16* p = &TemplateUlid)
                    {
                        h0 = ((long*)p)[0];
                        h1 = ((long*)p)[1];
                    }
                    // fowler hash - offset is 2166136261
                    int hash = (int)(h0 ^ (h0 >> 32)) * 16777619 ^ (int)(h1 ^ (h1 >> 32));
                    hash = (hash * 397) ^ Type;
                    hash = (hash * 397) ^ Flags;
                    hash = (hash * 397) ^ Amount;
                    hash = (hash * 397) ^ MaxAmount;
                    hash = (hash * 397) ^ HarvestYield;
                    hash = (hash * 397) ^ HarvestTime.GetHashCode();
                    return hash;
                }
            }
        }

        public static bool operator ==(ResourceBlit a, ResourceBlit b) => a.Equals(b);
        public static bool operator !=(ResourceBlit a, ResourceBlit b) => !a.Equals(b);
    }

}