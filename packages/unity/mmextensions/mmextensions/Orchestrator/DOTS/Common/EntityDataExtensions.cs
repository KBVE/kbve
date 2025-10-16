using System;
using System.Runtime.CompilerServices;
using Unity.Collections;
using Unity.Mathematics;
using KBVE.MMExtensions.Orchestrator.DOTS;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Common
{
    /// <summary>
    /// Extension methods and utilities for entity data types.
    /// Provides common operations and helper functions for all IEntityData implementations.
    /// </summary>
    public static class EntityDataExtensions
    {
        /// <summary>
        /// Checks if an entity data instance has valid/non-default values.
        /// Useful for validation and initialization checks.
        /// </summary>
        /// <typeparam name="T">The entity data type</typeparam>
        /// <param name="data">The entity data to validate</param>
        /// <returns>True if the data appears to be properly initialized</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsValid<T>(this T data) where T : struct, IEntityData<T>
        {
            return !data.Equals(default(T));
        }

        /// <summary>
        /// Creates a hash code for FixedBytes16 ULID fields.
        /// Provides consistent hashing for ULID-based equality operations.
        /// </summary>
        /// <param name="ulid">The ULID to hash</param>
        /// <returns>Hash code for the ULID</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static int GetUlidHashCode(in FixedBytes16 ulid)
        {
            // Use FixedBytes16's built-in byte access to create hash
            unchecked
            {
                // Combine first 8 bytes as long
                long part1 = ((long)ulid.byte0000) | ((long)ulid.byte0001 << 8) | ((long)ulid.byte0002 << 16) | ((long)ulid.byte0003 << 24) |
                            ((long)ulid.byte0004 << 32) | ((long)ulid.byte0005 << 40) | ((long)ulid.byte0006 << 48) | ((long)ulid.byte0007 << 56);

                // Combine last 8 bytes as long
                long part2 = ((long)ulid.byte0008) | ((long)ulid.byte0009 << 8) | ((long)ulid.byte0010 << 16) | ((long)ulid.byte0011 << 24) |
                            ((long)ulid.byte0012 << 32) | ((long)ulid.byte0013 << 40) | ((long)ulid.byte0014 << 48) | ((long)ulid.byte0015 << 56);

                // Create hash using FNV-1a style algorithm
                int hash = (int)(part1 ^ (part1 >> 32)) * 16777619;
                hash = (hash * 397) ^ (int)(part2 ^ (part2 >> 32));
                return hash;
            }
        }

        /// <summary>
        /// Compares two FixedBytes16 ULIDs for equality.
        /// Uses the existing Ulid infrastructure for consistency and performance.
        /// </summary>
        /// <param name="a">First ULID</param>
        /// <param name="b">Second ULID</param>
        /// <returns>True if the ULIDs are equal</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool UlidEquals(in FixedBytes16 a, in FixedBytes16 b)
        {
            // Use existing Ulid.Equals method which uses optimized UnsafeUtility.MemCmp
            return Ulid.Equals(a, b);
        }

        /// <summary>
        /// Safely compares two float values with epsilon tolerance.
        /// Handles floating-point precision issues in equality comparisons.
        /// </summary>
        /// <param name="a">First float value</param>
        /// <param name="b">Second float value</param>
        /// <param name="epsilon">Tolerance for comparison (default: math.EPSILON)</param>
        /// <returns>True if the values are approximately equal</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool FloatEquals(float a, float b, float epsilon = math.EPSILON)
        {
            return math.abs(a - b) < epsilon;
        }

        /// <summary>
        /// Creates a standardized hash code combining multiple integer values.
        /// Uses FNV-1a algorithm for good distribution and performance.
        /// </summary>
        /// <param name="values">Integer values to combine into hash</param>
        /// <returns>Combined hash code</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static int CombineHashCodes(params int[] values)
        {
            unchecked
            {
                int hash = 16777619; // FNV-1a offset basis
                for (int i = 0; i < values.Length; i++)
                {
                    hash = (hash * 397) ^ values[i];
                }
                return hash;
            }
        }

        /// <summary>
        /// Creates a standardized hash code combining byte values.
        /// Optimized for enum and flag combinations.
        /// </summary>
        /// <param name="values">Byte values to combine into hash</param>
        /// <returns>Combined hash code</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static int CombineByteHashCodes(params byte[] values)
        {
            unchecked
            {
                int hash = 16777619; // FNV-1a offset basis
                for (int i = 0; i < values.Length; i++)
                {
                    hash = (hash * 397) ^ values[i];
                }
                return hash;
            }
        }

        /// <summary>
        /// Validates that numeric values are within reasonable ranges.
        /// Helps prevent invalid data from corrupting entity state.
        /// </summary>
        /// <param name="value">The value to validate</param>
        /// <param name="minValue">Minimum allowed value</param>
        /// <param name="maxValue">Maximum allowed value</param>
        /// <returns>True if the value is within the specified range</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsInRange(int value, int minValue, int maxValue)
        {
            return value >= minValue && value <= maxValue;
        }

        /// <summary>
        /// Validates that float values are within reasonable ranges and not NaN/Infinity.
        /// Helps prevent invalid floating-point data from corrupting entity state.
        /// </summary>
        /// <param name="value">The value to validate</param>
        /// <param name="minValue">Minimum allowed value</param>
        /// <param name="maxValue">Maximum allowed value</param>
        /// <returns>True if the value is valid and within the specified range</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsValidFloat(float value, float minValue = float.MinValue, float maxValue = float.MaxValue)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value) && value >= minValue && value <= maxValue;
        }

        /// <summary>
        /// Clamps a value to ensure it stays within specified bounds.
        /// Useful for data sanitization and validation.
        /// </summary>
        /// <param name="value">The value to clamp</param>
        /// <param name="minValue">Minimum allowed value</param>
        /// <param name="maxValue">Maximum allowed value</param>
        /// <returns>The clamped value</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static int ClampInt(int value, int minValue, int maxValue)
        {
            return math.clamp(value, minValue, maxValue);
        }

        /// <summary>
        /// Clamps a float value and ensures it's not NaN/Infinity.
        /// Provides safe float value handling for entity data.
        /// </summary>
        /// <param name="value">The value to clamp and validate</param>
        /// <param name="minValue">Minimum allowed value</param>
        /// <param name="maxValue">Maximum allowed value</param>
        /// <param name="defaultValue">Value to use if input is NaN/Infinity</param>
        /// <returns>The safe, clamped value</returns>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float ClampFloat(float value, float minValue, float maxValue, float defaultValue = 0f)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
                return defaultValue;

            return math.clamp(value, minValue, maxValue);
        }
    }
}