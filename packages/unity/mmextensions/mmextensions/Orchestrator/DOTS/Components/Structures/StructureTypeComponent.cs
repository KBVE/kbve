using System;
using System.Runtime.InteropServices;
using System.Runtime.CompilerServices;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using Unity.Mathematics;
using ProtoBuf;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public enum StructureType : byte
    {
        None = 0
    }

    [Flags]
    public enum StructureFlags : byte
    {
        None = 0,
        IsWorld = 1 << 0,
    }

    /// <summary>
    /// Complete structure data with protobuf-net serialization support.
    /// This is the single source of truth for all structure-related data.
    /// Combines fields from both the original Structure component and StructureBlit.
    /// Size: ~44 bytes
    /// </summary>
    [ProtoContract]
    [StructLayout(LayoutKind.Sequential)]
    public struct StructureData : IEntityData<StructureData>, IEquatable<StructureData>
    {
        [ProtoMember(1)]
        public FixedBytes16 TemplateUlid;       // 16 bytes - Template reference

        [ProtoMember(2)]
        public StructureType Type;              // 1 byte - Structure type

        [ProtoMember(3)]
        public StructureFlags Flags;            // 1 byte - Structure flags

        [ProtoMember(4)]
        public int Level;                       // 4 bytes - Structure level

        [ProtoMember(5)]
        public int Health;                      // 4 bytes - Current health

        [ProtoMember(6)]
        public int MaxHealth;                   // 4 bytes - Maximum health

        [ProtoMember(7)]
        public int Attack;                      // 4 bytes - Attack value

        [ProtoMember(8)]
        public int Defense;                     // 4 bytes - Defense value (fixed typo)

        [ProtoMember(9)]
        public float ProductionRate;            // 4 bytes - Production speed

        [ProtoMember(10)]
        public float ProductionProgress;        // 4 bytes - Current production progress

        // ---- Equality Implementation ----
        public bool Equals(StructureData other)
        {
            return EntityDataExtensions.UlidEquals(TemplateUlid, other.TemplateUlid)
                && Type == other.Type
                && Flags == other.Flags
                && Level == other.Level
                && Health == other.Health
                && MaxHealth == other.MaxHealth
                && Attack == other.Attack
                && Defense == other.Defense
                && EntityDataExtensions.FloatEquals(ProductionRate, other.ProductionRate)
                && EntityDataExtensions.FloatEquals(ProductionProgress, other.ProductionProgress);
        }

        public override bool Equals(object obj) => obj is StructureData other && Equals(other);

        public override int GetHashCode()
        {
            return EntityDataExtensions.CombineHashCodes(
                EntityDataExtensions.GetUlidHashCode(TemplateUlid),
                (int)Type,
                (int)Flags,
                Level,
                Health,
                MaxHealth,
                Attack,
                Defense,
                ProductionRate.GetHashCode(),
                ProductionProgress.GetHashCode()
            );
        }

        public static bool operator ==(StructureData a, StructureData b) => a.Equals(b);
        public static bool operator !=(StructureData a, StructureData b) => !a.Equals(b);

        /// <summary>
        /// Validates that all structure data is within reasonable ranges.
        /// </summary>
        public bool IsValid()
        {
            return EntityDataValidation.IsValidUlid(TemplateUlid)
                && EntityDataExtensions.IsInRange(Level, 0, 1000)
                && EntityDataExtensions.IsInRange(Health, 0, MaxHealth)
                && EntityDataExtensions.IsInRange(MaxHealth, 1, int.MaxValue)
                && EntityDataExtensions.IsValidFloat(ProductionRate, 0f, 1000f)
                && EntityDataExtensions.IsValidFloat(ProductionProgress, 0f, 1f);
        }
    }

    /// <summary>
    /// ECS component wrapper for StructureData.
    /// Provides seamless integration with Unity DOTS while maintaining protobuf serialization.
    /// </summary>
    public struct Structure : IComponentData
    {
        public StructureData Data;

        // Implicit conversions for seamless usage
        public static implicit operator StructureData(Structure component) => component.Data;
        public static implicit operator Structure(StructureData data) => new Structure { Data = data };

    }

    /// <summary>
    /// Structure instance identifier component.
    /// </summary>
    public struct StructureID : IComponentData
    {
        public FixedBytes16 instanceUlid;
    }

    /// <summary>
    /// Convenience type alias for serialization operations.
    /// Usage: StructureBlit.Serialize(structureData)
    /// </summary>
    public static class StructureBlit
    {
        public static byte[] Serialize(StructureData data) => GenericBlit<StructureData>.Serialize(data);
        public static StructureData Deserialize(byte[] bytes) => GenericBlit<StructureData>.Deserialize(bytes);
        public static bool ValidateSerializable(StructureData data) => GenericBlit<StructureData>.ValidateSerializable(data);
        public static StructureData Clone(StructureData data) => GenericBlit<StructureData>.Clone(data);
    }
}