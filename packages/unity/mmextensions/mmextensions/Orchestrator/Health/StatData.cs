using UnityEngine;
using Unity.Mathematics;
//using R3;
using ObservableCollections;
using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;

namespace KBVE.MMExtensions.Orchestrator.Health
{
       /// <summary>
    /// Burst-compatible and network-safe representation of a stat.
    /// No references. Pure math logic.
    /// </summary>
    [Serializable]
    public struct StatData
    {
        public float Base;
        public float Max;
        public float RegenRate;
        public float BonusFlat;
        public float BonusPercent;
        public float Current;

        public StatData(float current, float max, float regenRate)
        {
            Base = current;
            Max = max;
            RegenRate = regenRate;
            BonusFlat = 0f;
            BonusPercent = 0f;
            Current = current;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public float EffectiveMax() => Max + BonusFlat + (Max * BonusPercent);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void Clamp()
        {
            Current = math.clamp(Current, 0f, EffectiveMax());
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void Regen(float deltaTime)
        {
            Current = math.min(Current + RegenRate * deltaTime, EffectiveMax());
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void Modify(float amount)
        {
            Current = math.clamp(Current + amount, 0f, EffectiveMax());
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void ApplyBonus(float flat, float percent)
        {
            BonusFlat += flat;
            BonusPercent += percent;
            Clamp();
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void RemoveBonus(float flat, float percent)
        {
            BonusFlat -= flat;
            BonusPercent -= percent;
            Clamp();
        }

        public void Deplete() => Current = 0f;
        public void Restore() => Current = EffectiveMax();

        public bool IsFull => math.abs(Current - EffectiveMax()) < 1e-5f;
        public bool IsEmpty => math.abs(Current) < 1e-5f;

        
    }

    // /// <summary>
    // /// Reactive wrapper for UI binding and state observation.
    // /// Not burst-safe. Should be used for local/client display only.
    // /// </summary>
    // public class StatDataReactive
    // {
    //     public ReactiveProperty<float> Current { get; } = new();

    //     public StatDataReactive(float initial)
    //     {
    //         Current.Value = initial;
    //     }

    //     public void UpdateFromRaw(in StatData raw)
    //     {
    //         Current.Value = raw.Current;
    //     }

    //     public void ApplyToRaw(ref StatData raw)
    //     {
    //         raw.Current = math.clamp(Current.Value, 0f, raw.EffectiveMax());
    //     }
    // }

    /// <summary>
    /// Describes a flat/percentage modifier to apply to a named stat.
    /// </summary>
    public struct StatModifier
    {
        public StatType Stat;
        public float Flat;
        public float Percent;

        public StatModifier(StatType stat, float flat, float percent = 0f)
        {
            Stat = stat;
            Flat = flat;
            Percent = percent;
        }
    }

    /// <summary>
    /// Extension helpers for conversion.
    /// </summary>
    // public static class StatDataConverter
    // {
    //     [MethodImpl(MethodImplOptions.AggressiveInlining)]
    //     public static StatDataReactive ToReactive(this in StatData raw)
    //     {
    //         return new StatDataReactive(raw.Current);
    //     }

    //     [MethodImpl(MethodImplOptions.AggressiveInlining)]
    //     public static StatData ToRaw(this StatDataReactive reactive, float baseValue, float max, float regenRate)
    //     {
    //         return new StatData
    //         {
    //             Base = baseValue,
    //             Max = max,
    //             RegenRate = regenRate,
    //             BonusFlat = 0f,
    //             BonusPercent = 0f,
    //             Current = reactive.Current.Value
    //         };
    //     }
    // }
}