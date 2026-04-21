using System;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Cysharp.Ulid factory helpers. Main-thread path calls Ulid.NewUlid (managed); Burst-safe path assembles 16 bytes from a ref Random + millisecond timestamp so it runs inside jobs.</summary>
    public static class UlidFactory
    {
        public static readonly Ulid Empty = default;

        public static Ulid NewUid() => Ulid.NewUlid();

        public static Ulid NewUid(ref Random rng, long unixMs)
        {
            Span<byte> bytes = stackalloc byte[16];
            bytes[0] = (byte)(unixMs >> 40);
            bytes[1] = (byte)(unixMs >> 32);
            bytes[2] = (byte)(unixMs >> 24);
            bytes[3] = (byte)(unixMs >> 16);
            bytes[4] = (byte)(unixMs >> 8);
            bytes[5] = (byte)unixMs;
            uint r0 = rng.NextUInt();
            uint r1 = rng.NextUInt();
            uint r2 = rng.NextUInt();
            bytes[6]  = (byte)r0;
            bytes[7]  = (byte)(r0 >> 8);
            bytes[8]  = (byte)(r0 >> 16);
            bytes[9]  = (byte)(r0 >> 24);
            bytes[10] = (byte)r1;
            bytes[11] = (byte)(r1 >> 8);
            bytes[12] = (byte)(r1 >> 16);
            bytes[13] = (byte)(r1 >> 24);
            bytes[14] = (byte)r2;
            bytes[15] = (byte)(r2 >> 8);
            return new Ulid(bytes);
        }

        public static long NowUnixMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }
}
