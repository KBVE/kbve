using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public static class Ulid
    {
        // Crockford Base32 (no I, L, O, U)
        // private const string Base32Chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

        private static ReadOnlySpan<char> Base32Chars => "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        private static readonly sbyte[] Base32Lookup = BuildLookup();

        // ---------- Public API ----------

        /// <summary>Convert ULID base32 string (26 chars) to FixedBytes16.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static FixedBytes16 ToBytes(string ulid)
        {
            if (!IsValid(ulid))
                throw new ArgumentException("ULID must be 26 Crockford Base32 chars.", nameof(ulid));

            Span<byte> tmp = stackalloc byte[16];
            if (!TryDecode(ulid, tmp))
                throw new ArgumentException("Invalid ULID encoding.", nameof(ulid));

            return FromSpan(tmp);
        }

        /// <summary>Convert FixedBytes16 back to ULID base32 string.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static string ToString(FixedBytes16 bytes)
        {
            ReadOnlySpan<byte> span = AsReadOnlySpan(bytes);
            return Encode(span);
        }

        /// <summary>Case-insensitive format check for a 26-char Crockford Base32 ULID.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsValid(string ulid)
        {
            if (string.IsNullOrEmpty(ulid) || ulid.Length != 26) return false;
            for (int i = 0; i < 26; i++)
                if (!IsValidChar(ulid[i])) return false;
            return true;
        }

        /// <summary>Constant-time compare of two FixedBytes16 values.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool Equals(FixedBytes16 a, FixedBytes16 b)
        {
            unsafe { return UnsafeUtility.MemCmp(&a, &b, 16) == 0; }
        }

        /// <summary>Generate a new ULID directly as FixedBytes16 (no string allocation). NOT Burst compatible - use NewUlidAsBytesWithTimestamp for Burst jobs.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static FixedBytes16 NewUlidAsBytes()
        {
            // Generate timestamp (48 bits) + randomness (80 bits) = 128 bits total
            long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            uint randomSeed = (uint)System.Environment.TickCount; // Use system tick count as seed
            return NewUlidAsBytesWithTimestamp(timestamp, randomSeed);
        }

        /// <summary>Generate a new ULID directly as FixedBytes16 with provided timestamp and random seed. Burst compatible.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static FixedBytes16 NewUlidAsBytesWithTimestamp(long timestampMs, uint randomSeed)
        {
            // Create 16-byte array for ULID
            Span<byte> bytes = stackalloc byte[16];

            // First 6 bytes: timestamp (48 bits, big-endian)
            bytes[0] = (byte)(timestampMs >> 40);
            bytes[1] = (byte)(timestampMs >> 32);
            bytes[2] = (byte)(timestampMs >> 24);
            bytes[3] = (byte)(timestampMs >> 16);
            bytes[4] = (byte)(timestampMs >> 8);
            bytes[5] = (byte)timestampMs;

            // Last 10 bytes: cryptographically random using Unity.Mathematics.Random (Burst compatible)
            var random = new Unity.Mathematics.Random(randomSeed);
            for (int i = 6; i < 16; i++)
            {
                bytes[i] = (byte)random.NextUInt(0, 256);
            }

            return FromSpan(bytes);
        }

        // ---------- Bridge-friendly helpers for FixedBytes16 ----------

        /// <summary>Copy FixedBytes16 into a new managed byte[16] without unsafe at callsite.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static byte[] ToArrayNoUnsafe(this FixedBytes16 fb)
        {
            ReadOnlySpan<byte> src = AsReadOnlySpan(fb);
            return src.ToArray(); // exactly 16 bytes
        }

        /// <summary>Copy FixedBytes16 into destination Span<byte> (length >= 16). No allocation.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool TryCopyTo(this FixedBytes16 fb, Span<byte> destination)
        {
            if (destination.Length < 16) return false;
            ReadOnlySpan<byte> src = AsReadOnlySpan(fb);
            src.CopyTo(destination);
            return true;
        }

        /// <summary>Fastest: memcpy FixedBytes16 -> new byte[16]. Keeps unsafe localized here.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static byte[] ToArrayFast(this FixedBytes16 fb)
        {
            var arr = new byte[16];
            unsafe
            {
                fixed (byte* dst = arr)
                {
                    UnsafeUtility.MemCpy(dst, &fb, 16);
                }
            }
            return arr;
        }

        /// <summary>Create FixedBytes16 from first 16 bytes of the source span.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static FixedBytes16 FromSpan(ReadOnlySpan<byte> src)
        {
            if (src.Length < 16) throw new ArgumentException("Need 16 bytes", nameof(src));
            FixedBytes16 fb = default;
            Span<byte> dst = AsSpan(ref fb);
            src.Slice(0, 16).CopyTo(dst);
            return fb;
        }

        // ---------- Encoding / Decoding (span-based, allocation-free) ----------

        /// <summary>Encode 16 bytes (ULID) to 26-char Crockford Base32 string.</summary>
        public static string Encode(ReadOnlySpan<byte> bytes)
        {
            if (bytes.Length < 16) throw new ArgumentException("Need 16 bytes", nameof(bytes));
            bytes = bytes.Slice(0, 16);

            Span<char> chars = stackalloc char[26];
            int ci = 0;
            int bitCount = 0;
            int bitBuf = 0;

            for (int i = 0; i < 16; i++)
            {
                bitBuf = (bitBuf << 8) | bytes[i];
                bitCount += 8;
                while (bitCount >= 5)
                {
                    bitCount -= 5;
                    chars[ci++] = Base32Chars[(bitBuf >> bitCount) & 0x1F];
                }
            }
            if (bitCount > 0)
            {
                chars[ci++] = Base32Chars[(bitBuf << (5 - bitCount)) & 0x1F];
            }
            // ULID is exactly 128 bits -> 26 chars; if short, pad with '0'
            while (ci < 26) chars[ci++] = '0';

            return new string(chars);
        }

        /// <summary>Decode 26-char Crockford Base32 ULID into 16 bytes (dest span).</summary>
        public static bool TryDecode(string ulid, Span<byte> dest)
        {
            if (ulid == null || ulid.Length != 26 || dest.Length < 16) return false;

            int bitBuf = 0;
            int bitCount = 0;
            int bi = 0;

            for (int i = 0; i < 26; i++)
            {
                int v = CharToValue(ulid[i]);
                if (v < 0) return false;

                bitBuf = (bitBuf << 5) | v;
                bitCount += 5;

                while (bitCount >= 8)
                {
                    bitCount -= 8;
                    if (bi < 16)
                        dest[bi++] = (byte)((bitBuf >> bitCount) & 0xFF);
                }
            }
            return bi == 16;
        }

        // ---------- Internal helpers ----------

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static bool IsValidChar(char c) => CharToValue(c) >= 0;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static int CharToValue(char c)
        {
            if((uint)c >=128) return -1;
            return Base32Lookup[c];
        }

        private static sbyte[] BuildLookup()
        {
            var lut = new sbyte[128];
            for (int i = 0; i < lut.Length; i++) lut[i] = -1;
            const string chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
            for (int i = 0; i < chars.Length; i++)
            {
                char upper = chars[i];
                char lower = char.ToLower(upper);
                lut[upper] = (sbyte)i;
                lut[lower] =  (sbyte)i;
            }
            return lut;
        }


        // <MM> -> AllocHGlobal / FreeHGlobal (IntPtr)
        // Trying MemoryMarshal
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static ReadOnlySpan<byte> AsReadOnlySpan(in FixedBytes16 fb)
        {
            // Use unsafe pointer version for Burst compatibility
            return AsReadOnlySpanPtrGym(in fb);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static Span<byte> AsSpan(ref FixedBytes16 fb)
        {
            // Use unsafe pointer version for Burst compatibility
            return AsSpanPtrGym(ref fb);
        }

        // Burst-compatible version using unsafe pointers (centralize unsafe here)
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static ReadOnlySpan<byte> AsReadOnlySpanPtrGym(in FixedBytes16 fb)
        {
            unsafe
            {
                fixed (FixedBytes16* p = &fb)
                {
                    return new ReadOnlySpan<byte>(p, 16);
                }
            }
        }


        // Burst-compatible version using unsafe pointers
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static Span<byte> AsSpanPtrGym(ref FixedBytes16 fb)
        {
            unsafe
            {
                fixed (FixedBytes16* p = &fb)
                {
                    return new Span<byte>(p, 16);
                }
            }
        }


    }
}
