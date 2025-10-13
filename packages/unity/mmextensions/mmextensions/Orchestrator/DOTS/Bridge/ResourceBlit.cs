using System;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    [StructLayout(LayoutKind.Sequential)]
    public struct ResourceBlit : IEquatable<ResourceBlit>
    {
        public FixedBytes16 Ulid;
        public byte Type;
        public byte Flags;
        public ushort Amount;
        public ushort MaxAmount;
        public ushort HarvestYield;
        public float HarvestTime;
        public float3 WorldPos;

        // ---- Equality for DistinctUntilChanged ----

        public bool Equals(ResourceBlit other)
        {
            // Ulid equality via your Ulid.Equals(FixedBytes16, FixedBytes16)
            return KBVE.MMExtensions.Orchestrator.DOTS.Ulid.Equals(Ulid, other.Ulid)
                && Type == other.Type
                && Flags == other.Flags
                && Amount == other.Amount
                && MaxAmount == other.MaxAmount
                && HarvestYield == other.HarvestYield
                && HarvestTime.Equals(other.HarvestTime)
                && WorldPos.Equals(other.WorldPos);
        }

        public override bool Equals(object obj) => obj is ResourceBlit o && Equals(o);

        public override int GetHashCode()
        {
            // Fast hash; Ulid folded via two 8-byte compares
            unsafe
            {
                long h0, h1;
                fixed (FixedBytes16* p = &Ulid)
                {
                    h0 = ((long*)p)[0];
                    h1 = ((long*)p)[1];
                }
                // combine
                unchecked
                {
                    int hash = (int)(h0 ^ (h0 >> 32)) * 16777619 ^ (int)(h1 ^ (h1 >> 32));
                    hash = (hash * 397) ^ Type;
                    hash = (hash * 397) ^ Flags;
                    hash = (hash * 397) ^ Amount;
                    hash = (hash * 397) ^ MaxAmount;
                    hash = (hash * 397) ^ HarvestYield;
                    hash = (hash * 397) ^ HarvestTime.GetHashCode();
                    hash = (hash * 397) ^ (int)math.hash(WorldPos);
                    return hash;
                }
            }
        }

        public static bool operator ==(ResourceBlit a, ResourceBlit b) => a.Equals(b);
        public static bool operator !=(ResourceBlit a, ResourceBlit b) => !a.Equals(b);

    }


}