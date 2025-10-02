using System;
using System.Runtime.CompilerServices;
using Unity.Entities;
using Unity.Mathematics;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Default horde settings for DOTS v2 prep. Equality intentionally compares only <see cref="defaultSettings"/>.
    /// </summary>
    public struct HordeDefaultSettings : IComponentData, IEquatable<HordeDefaultSettings>
    {
        public Entity minionPrefab;
        public HordeSettings defaultSettings;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public float2 MinionMargin => defaultSettings.minionMargin;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public int2 HordeResolution => defaultSettings.hordeResolution;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public int MinionCount => HordeResolution.x * HordeResolution.y;

        /// <summary>
        /// Equality is defined by <see cref="defaultSettings"/> only (not prefab).
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool Equals(HordeDefaultSettings other)
        {
            return defaultSettings == other.defaultSettings;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool operator ==(HordeDefaultSettings a, HordeDefaultSettings b) => a.Equals(b);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool operator !=(HordeDefaultSettings a, HordeDefaultSettings b) => !a.Equals(b);

        /// <summary>
        /// Computes the full footprint of the grid assuming each cell's "footprint" is
        /// (2 * margin + 1) * minionSize, then multiplied by resolution. This matches the original behavior.
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float2 GetHordeSize(in int2 hordeResolution, in float2 minionSize, in float2 minionMargin)
        {
            return hordeResolution * (2f * minionMargin + 1f) * minionSize;
        }

        // IMPORTANT: make object.Equals and GetHashCode consistent with IEquatable
        public override bool Equals(object obj) => obj is HordeDefaultSettings other && Equals(other);

        public override int GetHashCode()
        {
            // Hash only the field used in Equals. If HordeSettings already implements a stable hash, this stays consistent.
            return defaultSettings.GetHashCode();
        }
    }
}