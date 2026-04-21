using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Stable byte IDs for jobs; mirrors a repr(u8) Rust enum for future FFI. Looter is the default hauler role; Guard engages hostiles in range and patrols friendly territory otherwise.</summary>
    public static class JobKind
    {
        public const byte None       = 0;
        public const byte Lumberjack = 2;
        public const byte Miner      = 3;
        public const byte Guard      = 4;
        public const byte Looter     = 5;
        public const byte Farmer     = 6;
        public const byte Builder    = 7;
        public const byte Chef       = 8;
        public const byte Hunter     = 9;
        public const byte Blacksmith = 10;
        public const byte Craftsman  = 11;
    }

    /// <summary>Per-unit job priorities (0 = disabled, 1..5 = weighted preference). Fixed-layout struct so it's Burst-readable without a buffer walk.</summary>
    public struct JobPriorities : IComponentData
    {
        public byte Lumberjack;
        public byte Miner;
        public byte Guard;
        public byte Looter;
        public byte Farmer;
        public byte Builder;
        public byte Chef;
        public byte Hunter;
        public byte Blacksmith;
        public byte Craftsman;

        public byte Get(byte jobKind) => jobKind switch
        {
            JobKind.Lumberjack => Lumberjack,
            JobKind.Miner      => Miner,
            JobKind.Guard      => Guard,
            JobKind.Looter     => Looter,
            JobKind.Farmer     => Farmer,
            JobKind.Builder    => Builder,
            JobKind.Chef       => Chef,
            JobKind.Hunter     => Hunter,
            JobKind.Blacksmith => Blacksmith,
            JobKind.Craftsman  => Craftsman,
            _                  => (byte)0,
        };

        public void Set(byte jobKind, byte priority)
        {
            switch (jobKind)
            {
                case JobKind.Lumberjack: Lumberjack = priority; break;
                case JobKind.Miner:      Miner      = priority; break;
                case JobKind.Guard:      Guard      = priority; break;
                case JobKind.Looter:     Looter     = priority; break;
                case JobKind.Farmer:     Farmer     = priority; break;
                case JobKind.Builder:    Builder    = priority; break;
                case JobKind.Chef:       Chef       = priority; break;
                case JobKind.Hunter:     Hunter     = priority; break;
                case JobKind.Blacksmith: Blacksmith = priority; break;
                case JobKind.Craftsman:  Craftsman  = priority; break;
            }
        }
    }

    /// <summary>Current chosen job + target; rewritten each tick by JobSystem when Relief isn't active.</summary>
    public struct JobIntent : IComponentData
    {
        public byte  Kind;
        public int2  TargetHex;
        public Entity TargetEntity;
    }
}
