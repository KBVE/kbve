using System;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Minimal universal entity data. Always present for any entity.
    /// Size: ~36 bytes
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct EntityBlit : IEquatable<EntityBlit>
    {
        // Universal fields (all entities have these)
        public FixedBytes16 Ulid;              // 16 bytes
        public EntityType Type;                // 4 bytes
        public EntityActionFlags ActionFlags;  // 4 bytes
        public float3 WorldPos;                // 12 bytes



        // ---- Equality ----
        public bool Equals(EntityBlit other)
        {
            return Ulid.Equals(other.Ulid)
                && Type == other.Type
                && ActionFlags == other.ActionFlags
                && WorldPos.Equals(other.WorldPos);
        }

        public override bool Equals(object obj) => obj is EntityBlit o && Equals(o);

        public override int GetHashCode()
        {
            unsafe
            {
                long h0, h1;
                fixed (FixedBytes16* p = &Ulid)
                {
                    h0 = ((long*)p)[0];
                    h1 = ((long*)p)[1];
                }

                unchecked
                {
                    int hash = (int)(h0 ^ (h0 >> 32)) * 16777619 ^ (int)(h1 ^ (h1 >> 32));
                    hash = (hash * 397) ^ (int)Type;
                    hash = (hash * 397) ^ (int)ActionFlags;
                    hash = (hash * 397) ^ (int)math.hash(WorldPos);
                    return hash;
                }
            }
        }

        public static bool operator ==(EntityBlit a, EntityBlit b) => a.Equals(b);
        public static bool operator !=(EntityBlit a, EntityBlit b) => !a.Equals(b);
    }
}