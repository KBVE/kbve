using System;
using System.IO;
using ProtoBuf;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Common
{
    /// <summary>
    /// Generic serialization operations for protobuf-net powered entity data.
    /// Provides type-safe, high-performance binary serialization for network operations.
    /// </summary>
    /// <typeparam name="T">The entity data type with protobuf-net attributes</typeparam>
    public static class GenericBlit<T> where T : struct, IEntityData<T>
    {
        /// <summary>
        /// Serializes entity data to a byte array using protobuf-net.
        /// Ideal for network transmission or persistent storage.
        /// </summary>
        /// <param name="data">The entity data to serialize</param>
        /// <returns>Compact binary representation of the data</returns>
        public static byte[] Serialize(T data)
        {
            try
            {
                using var memoryStream = new MemoryStream();
                Serializer.Serialize(memoryStream, data);
                return memoryStream.ToArray();
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to serialize {typeof(T).Name}: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Deserializes entity data from a byte array using protobuf-net.
        /// </summary>
        /// <param name="bytes">The binary data to deserialize</param>
        /// <returns>The reconstructed entity data</returns>
        /// <exception cref="ArgumentNullException">Thrown when bytes is null</exception>
        /// <exception cref="InvalidOperationException">Thrown when deserialization fails</exception>
        public static T Deserialize(byte[] bytes)
        {
            if (bytes == null)
                throw new ArgumentNullException(nameof(bytes));

            if (bytes.Length == 0)
                throw new ArgumentException("Cannot deserialize empty byte array", nameof(bytes));

            try
            {
                using var memoryStream = new MemoryStream(bytes);
                return Serializer.Deserialize<T>(memoryStream);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to deserialize {typeof(T).Name}: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Serializes entity data directly to a stream using protobuf-net.
        /// More efficient for large data or streaming scenarios.
        /// </summary>
        /// <param name="stream">The stream to write to</param>
        /// <param name="data">The entity data to serialize</param>
        /// <exception cref="ArgumentNullException">Thrown when stream is null</exception>
        /// <exception cref="InvalidOperationException">Thrown when serialization fails</exception>
        public static void Serialize(Stream stream, T data)
        {
            if (stream == null)
                throw new ArgumentNullException(nameof(stream));

            try
            {
                Serializer.Serialize(stream, data);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to serialize {typeof(T).Name} to stream: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Deserializes entity data from a stream using protobuf-net.
        /// More efficient for large data or streaming scenarios.
        /// </summary>
        /// <param name="stream">The stream to read from</param>
        /// <returns>The reconstructed entity data</returns>
        /// <exception cref="ArgumentNullException">Thrown when stream is null</exception>
        /// <exception cref="InvalidOperationException">Thrown when deserialization fails</exception>
        public static T Deserialize(Stream stream)
        {
            if (stream == null)
                throw new ArgumentNullException(nameof(stream));

            try
            {
                return Serializer.Deserialize<T>(stream);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to deserialize {typeof(T).Name} from stream: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Gets the approximate serialized size of the data without actually serializing.
        /// Useful for buffer allocation and network optimization.
        /// </summary>
        /// <param name="data">The entity data to measure</param>
        /// <returns>Approximate size in bytes</returns>
        public static int GetSerializedSize(T data)
        {
            try
            {
                using var memoryStream = new MemoryStream();
                Serializer.Serialize(memoryStream, data);
                return (int)memoryStream.Length;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to measure serialized size of {typeof(T).Name}: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Creates a deep copy of entity data using serialization round-trip.
        /// Ensures complete data isolation.
        /// </summary>
        /// <param name="data">The entity data to clone</param>
        /// <returns>A deep copy of the data</returns>
        public static T Clone(T data)
        {
            try
            {
                var bytes = Serialize(data);
                return Deserialize(bytes);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to clone {typeof(T).Name}: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Validates that the entity data can be successfully serialized and deserialized.
        /// Useful for testing and validation scenarios.
        /// </summary>
        /// <param name="data">The entity data to validate</param>
        /// <returns>True if serialization round-trip succeeds</returns>
        public static bool ValidateSerializable(T data)
        {
            try
            {
                var bytes = Serialize(data);
                var deserialized = Deserialize(bytes);
                return data.Equals(deserialized);
            }
            catch
            {
                return false;
            }
        }
    }
}