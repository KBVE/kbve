using Unity.Entities;
using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using ProtoBuf;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public enum ResourceType : byte
    {
        None = 0,
        Wood = 1,
        Stone = 2,
        Metal = 3,
        Food = 4
    }

    [Flags]
    public enum ResourceFlags : byte
    {
        None = 0,
        IsHarvestable = 1 << 0,
        IsDepleted = 1 << 1,
    }

    /// <summary>
    /// Complete resource data with protobuf-net serialization support.
    /// This is the single source of truth for all resource-related data.
    /// Combines fields from both the original Resource component and ResourceBlit.
    /// Size: ~32 bytes
    /// </summary>
    [ProtoContract]
    [StructLayout(LayoutKind.Sequential)]
    public struct ResourceData : IEntityData<ResourceData>, IEquatable<ResourceData>
    {
        [ProtoMember(1)]
        public FixedBytes16 TemplateUlid;       // 16 bytes - Template reference

        [ProtoMember(2)]
        public ResourceType Type;               // 1 byte - Resource type

        [ProtoMember(3)]
        public ResourceFlags Flags;             // 1 byte - Resource flags

        [ProtoMember(4)]
        public int Amount;                      // 4 bytes - Current amount (changed to int for ECS performance)

        [ProtoMember(5)]
        public int MaxAmount;                   // 4 bytes - Maximum capacity (changed to int for ECS performance)

        [ProtoMember(6)]
        public int HarvestYield;                // 4 bytes - Harvest yield amount (changed to int for ECS performance)

        [ProtoMember(7)]
        public float HarvestTime;               // 4 bytes - Time required to harvest

        // ---- Equality Implementation ----
        public bool Equals(ResourceData other)
        {
            return EntityDataExtensions.UlidEquals(TemplateUlid, other.TemplateUlid)
                && Type == other.Type
                && Flags == other.Flags
                && Amount == other.Amount
                && MaxAmount == other.MaxAmount
                && HarvestYield == other.HarvestYield
                && EntityDataExtensions.FloatEquals(HarvestTime, other.HarvestTime);
        }

        public override bool Equals(object obj) => obj is ResourceData other && Equals(other);

        public override int GetHashCode()
        {
            return EntityDataExtensions.CombineHashCodes(
                EntityDataExtensions.GetUlidHashCode(TemplateUlid),
                (int)Type,
                (int)Flags,
                Amount,
                MaxAmount,
                HarvestYield,
                HarvestTime.GetHashCode()
            );
        }

        public static bool operator ==(ResourceData a, ResourceData b) => a.Equals(b);
        public static bool operator !=(ResourceData a, ResourceData b) => !a.Equals(b);

        /// <summary>
        /// Validates that all resource data is within reasonable ranges.
        /// </summary>
        public bool IsValid()
        {
            return EntityDataValidation.IsValidUlid(TemplateUlid)
                && EntityDataExtensions.IsInRange(Amount, 0, MaxAmount)
                && EntityDataExtensions.IsInRange(MaxAmount, 1, int.MaxValue)
                && EntityDataExtensions.IsInRange(HarvestYield, 0, int.MaxValue)
                && EntityDataExtensions.IsValidFloat(HarvestTime, 0f, 1000f);
        }

        // ---- Resource-specific helper methods ----
        public bool IsDepleted => (Flags & ResourceFlags.IsDepleted) != 0;
        public bool IsHarvestable => (Flags & ResourceFlags.IsHarvestable) != 0 && Amount > 0 && !IsDepleted;
        public bool GetHarvestableFlag => (Flags & ResourceFlags.IsHarvestable) != 0;

        public ResourceData SetDepleted(bool value)
        {
            var result = this;
            if (value)
                result.Flags |= ResourceFlags.IsDepleted;
            else
                result.Flags &= ~ResourceFlags.IsDepleted;
            return result;
        }

        public ResourceData SetHarvestableFlag(bool value)
        {
            var result = this;
            if (value)
                result.Flags |= ResourceFlags.IsHarvestable;
            else
                result.Flags &= ~ResourceFlags.IsHarvestable;
            return result;
        }
    }

    /// <summary>
    /// ECS component wrapper for ResourceData.
    /// Provides seamless integration with Unity DOTS while maintaining protobuf serialization.
    /// </summary>
    public struct Resource : IComponentData
    {
        public ResourceData Data;

        // Implicit conversions for seamless usage
        public static implicit operator ResourceData(Resource component) => component.Data;
        public static implicit operator Resource(ResourceData data) => new Resource { Data = data };
    }

    /// <summary>
    /// Resource instance identifier component.
    /// </summary>
    public struct ResourceID : IComponentData
    {
        public FixedBytes16 instanceUlid;
    }

    /// <summary>
    /// Extension methods for Resource component that delegate to ResourceData methods.
    /// Maintains compatibility with existing code patterns.
    /// </summary>
    public static class ResourceExtensions
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsDepleted(this Resource resource)
        {
            return resource.Data.IsDepleted;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetDepleted(ref this Resource resource, bool value)
        {
            resource.Data = resource.Data.SetDepleted(value);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsHarvestable(this Resource resource)
        {
            return resource.Data.IsHarvestable;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool GetHarvestableFlag(this Resource resource)
        {
            return resource.Data.GetHarvestableFlag;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetHarvestableFlag(ref this Resource resource, bool value)
        {
            resource.Data = resource.Data.SetHarvestableFlag(value);
        }
    }

    /// <summary>
    /// Convenience type alias for serialization operations.
    /// Usage: ResourceBlit.Serialize(resourceData)
    /// </summary>
    public static class ResourceBlit
    {
        public static byte[] Serialize(ResourceData data) => GenericBlit<ResourceData>.Serialize(data);
        public static ResourceData Deserialize(byte[] bytes) => GenericBlit<ResourceData>.Deserialize(bytes);
        public static bool ValidateSerializable(ResourceData data) => GenericBlit<ResourceData>.ValidateSerializable(data);
        public static ResourceData Clone(ResourceData data) => GenericBlit<ResourceData>.Clone(data);
    }
}