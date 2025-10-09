using System;
using System.Runtime.CompilerServices;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public static class Ulid
    {
        // Base32 Crockford alphabet for ULID encoding
        private const string Base32Chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        
        /// <summary>
        /// Convert ULID string (26 chars base32) to FixedBytes16
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static FixedBytes16 ToBytes(string ulid)
        {
            if (string.IsNullOrEmpty(ulid) || ulid.Length != 26)
                throw new ArgumentException("ULID must be exactly 26 characters");
            
            byte[] bytes = Decode(ulid);
            
            FixedBytes16 result = default;
            unsafe
            {
                byte* dst = (byte*)&result;
                for (int i = 0; i < 16; i++)
                    dst[i] = bytes[i];
            }
            return result;
        }
        
        /// <summary>
        /// Convert FixedBytes16 back to ULID string
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static string ToString(FixedBytes16 bytes)
        {
            byte[] array = new byte[16];
            unsafe
            {
                byte* src = (byte*)&bytes;
                for (int i = 0; i < 16; i++)
                    array[i] = src[i];
            }
            return Encode(array);
        }
        
        /// <summary>
        /// Compare two ULID FixedBytes16 for equality
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool Equals(FixedBytes16 a, FixedBytes16 b)
        {
            unsafe
            {
                long* ptrA = (long*)&a;
                long* ptrB = (long*)&b;
                
                // Compare as longs for speed (16 bytes = 2 longs)
                return ptrA[0] == ptrB[0] && ptrA[1] == ptrB[1];
            }
        }
        
        /// <summary>
        /// Validate ULID string format
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsValid(string ulid)
        {
            if (string.IsNullOrEmpty(ulid) || ulid.Length != 26)
                return false;
            
            foreach (char c in ulid)
            {
                if (!IsValidChar(c))
                    return false;
            }
            
            return true;
        }
        
        #region Private Encoding/Decoding
        
        private static byte[] Decode(string ulid)
        {
            byte[] bytes = new byte[16];
            long value = 0;
            int index = 0;
            
            for (int i = 0; i < ulid.Length; i++)
            {
                value = value * 32 + CharToValue(ulid[i]);
                
                if ((i + 1) % 4 == 0 || i == ulid.Length - 1)
                {
                    int byteCount = (i + 1) % 4 == 0 ? 5 : ((i + 1) % 4 * 5 + 7) / 8;
                    for (int j = byteCount - 1; j >= 0; j--)
                    {
                        if (index < 16)
                            bytes[index++] = (byte)(value >> (j * 8));
                    }
                    value = 0;
                }
            }
            
            return bytes;
        }
        
        private static string Encode(byte[] bytes)
        {
            char[] chars = new char[26];
            int charIndex = 0;
            long value = 0;
            int bits = 0;
            
            for (int i = 0; i < bytes.Length; i++)
            {
                value = (value << 8) | bytes[i];
                bits += 8;
                
                while (bits >= 5)
                {
                    bits -= 5;
                    chars[charIndex++] = Base32Chars[(int)((value >> bits) & 31)];
                }
            }
            
            if (bits > 0)
                chars[charIndex++] = Base32Chars[(int)((value << (5 - bits)) & 31)];
            
            return new string(chars, 0, 26);
        }
        
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static int CharToValue(char c)
        {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'A' && c <= 'H') return c - 'A' + 10;
            if (c >= 'J' && c <= 'K') return c - 'J' + 18;
            if (c >= 'M' && c <= 'N') return c - 'M' + 20;
            if (c >= 'P' && c <= 'T') return c - 'P' + 22;
            if (c >= 'V' && c <= 'Z') return c - 'V' + 27;
            if (c >= 'a' && c <= 'z') return CharToValue(char.ToUpper(c));
            throw new ArgumentException($"Invalid ULID character: {c}");
        }
        
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static bool IsValidChar(char c)
        {
            return (c >= '0' && c <= '9') ||
                   (c >= 'A' && c <= 'H') ||
                   (c >= 'J' && c <= 'K') ||
                   (c >= 'M' && c <= 'N') ||
                   (c >= 'P' && c <= 'T') ||
                   (c >= 'V' && c <= 'Z') ||
                   (c >= 'a' && c <= 'z');
        }
        
        #endregion
    }
}