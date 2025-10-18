using System;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Common
{
    /// <summary>
    /// Base interface for all entity data types in the DOTS system.
    /// Provides common contracts that all protobuf-net powered entity data must implement.
    /// </summary>
    /// <typeparam name="T">The concrete entity data type</typeparam>
    public interface IEntityData<T> : IEquatable<T> where T : struct
    {
        // No additional members required - the interface serves as a marker
        // and ensures IEquatable<T> implementation for efficient DOTS operations
    }

    /// <summary>
    /// Common validation and utility methods for entity data types.
    /// Provides shared functionality across all entity data implementations.
    /// </summary>
    public static class EntityDataValidation
    {
        /// <summary>
        /// Validates that a FixedBytes16 ULID is not empty/default.
        /// Uses the existing Ulid infrastructure for consistency.
        /// </summary>
        /// <param name="ulid">The ULID to validate</param>
        /// <returns>True if the ULID contains valid data</returns>
        public static bool IsValidUlid(in FixedBytes16 ulid)
        {
            // Use existing Ulid.Equals to check against default/empty ULID
            return !Ulid.Equals(ulid, default(FixedBytes16));
        }

        /// <summary>
        /// Creates a default/empty FixedBytes16 for initialization.
        /// </summary>
        /// <returns>A zeroed FixedBytes16 structure</returns>
        public static FixedBytes16 EmptyUlid()
        {
            return new FixedBytes16();
        }
    }
}