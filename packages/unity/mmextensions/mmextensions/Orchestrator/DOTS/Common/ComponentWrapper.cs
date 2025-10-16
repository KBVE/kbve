using System;
using Unity.Entities;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Common
{
    /// <summary>
    /// Generic ECS component wrapper for entity data types.
    /// Provides seamless conversion between protobuf-net data structures and Unity DOTS components.
    /// </summary>
    /// <typeparam name="T">The entity data type that implements IEntityData</typeparam>
    public struct ComponentWrapper<T> : IComponentData where T : struct, IEntityData<T>
    {
        /// <summary>
        /// The underlying entity data structure containing all the actual data.
        /// </summary>
        public T Data;

        /// <summary>
        /// Creates a new component wrapper with the specified data.
        /// </summary>
        /// <param name="data">The entity data to wrap</param>
        public ComponentWrapper(T data)
        {
            Data = data;
        }

        /// <summary>
        /// Implicit conversion from wrapper to underlying data type.
        /// Allows seamless usage in serialization and network operations.
        /// </summary>
        /// <param name="wrapper">The component wrapper</param>
        /// <returns>The underlying entity data</returns>
        public static implicit operator T(ComponentWrapper<T> wrapper)
        {
            return wrapper.Data;
        }

        /// <summary>
        /// Implicit conversion from data type to component wrapper.
        /// Allows seamless creation of ECS components from protobuf data.
        /// </summary>
        /// <param name="data">The entity data</param>
        /// <returns>A new component wrapper containing the data</returns>
        public static implicit operator ComponentWrapper<T>(T data)
        {
            return new ComponentWrapper<T>(data);
        }


        /// <summary>
        /// Equality comparison based on the underlying data.
        /// </summary>
        /// <param name="other">The other component wrapper to compare</param>
        /// <returns>True if the underlying data is equal</returns>
        public bool Equals(ComponentWrapper<T> other)
        {
            return Data.Equals(other.Data);
        }

        /// <summary>
        /// Object equality override.
        /// </summary>
        /// <param name="obj">The object to compare</param>
        /// <returns>True if the objects are equal</returns>
        public override bool Equals(object obj)
        {
            return obj is ComponentWrapper<T> other && Equals(other);
        }

        /// <summary>
        /// Hash code based on the underlying data.
        /// </summary>
        /// <returns>Hash code of the underlying data</returns>
        public override int GetHashCode()
        {
            return Data.GetHashCode();
        }

        /// <summary>
        /// String representation for debugging.
        /// </summary>
        /// <returns>String representation of the wrapper and its data</returns>
        public override string ToString()
        {
            return $"ComponentWrapper<{typeof(T).Name}>({Data})";
        }

        /// <summary>
        /// Equality operator.
        /// </summary>
        public static bool operator ==(ComponentWrapper<T> left, ComponentWrapper<T> right)
        {
            return left.Equals(right);
        }

        /// <summary>
        /// Inequality operator.
        /// </summary>
        public static bool operator !=(ComponentWrapper<T> left, ComponentWrapper<T> right)
        {
            return !left.Equals(right);
        }
    }
}