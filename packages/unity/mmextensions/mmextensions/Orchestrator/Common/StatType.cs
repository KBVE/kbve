using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using UnityEngine;


namespace KBVE.MMExtensions.Orchestrator.Health
{
    public enum StatType
    {
        Health,
        Mana,
        Stamina,
        Energy,
        Strength,
        Intelligence,
        Armor,
    }

    [Flags]
    public enum StatTraits
    {
        None = 0,
        Attribute = 1 << 0,
        Regenerate = 1 << 1,
        Core = 1 << 2,
        Defensive = 1 << 3,
        Offensive = 1 << 4,
        Buff = 1 << 5,
    }

    public struct StatMetaData
    {
        public Color HexColor;
        public StatTraits Traits;

        public StatMetaData(Color color, StatTraits traits)
        {
            HexColor = color;
            Traits = traits;
        }
    }

    public static class StatTypeConfig
    {
        public static readonly Dictionary<StatType, StatMetaData> Metadata = new()
        {
            { StatType.Health,       new StatMetaData(new Color(1f, 0.3f, 0.3f), StatTraits.Regenerate | StatTraits.Core) },
            { StatType.Mana,         new StatMetaData(new Color(0.3f, 0.5f, 1f), StatTraits.Regenerate) },
            { StatType.Stamina,      new StatMetaData(new Color(0.3f, 1f, 0.3f), StatTraits.Regenerate) },
            { StatType.Energy,       new StatMetaData(new Color(1f, 0.84f, 0f), StatTraits.Regenerate) },
            { StatType.Strength,     new StatMetaData(new Color(1f, 0.55f, 0f), StatTraits.Attribute | StatTraits.Offensive) },
            { StatType.Intelligence, new StatMetaData(new Color(0.6f, 0.25f, 0.8f), StatTraits.Attribute) },
            { StatType.Armor,        new StatMetaData(new Color(0.66f, 0.66f, 0.66f), StatTraits.Defensive) },
        };
    }

    public static class StatTypeExtensions
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool HasTrait(this StatType type, StatTraits trait)
        {
            return (StatTypeConfig.Metadata[type].Traits & trait) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static Color GetColor(this StatType type)
        {
            return StatTypeConfig.Metadata[type].HexColor;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsRegenerable(this StatType type)
        {
            return type.HasTrait(StatTraits.Regenerate);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsAttribute(this StatType type)
        {
            return type.HasTrait(StatTraits.Attribute);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsCore(this StatType type)
        {
            return type.HasTrait(StatTraits.Core);
        }
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsOffensive(this StatType type)
        {
            return type.HasTrait(StatTraits.Offensive);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsDefensive(this StatType type)
        {
            return type.HasTrait(StatTraits.Defensive);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsBuff(this StatType type)
        {
            return type.HasTrait(StatTraits.Buff);
        }

    }
}