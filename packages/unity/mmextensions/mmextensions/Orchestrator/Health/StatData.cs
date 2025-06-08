using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Health
{


    /// <summary>
    /// Represents a single stat (e.g., mana, stamina, energy) with support for clamped modification and regeneration.
    /// </summary>
    [System.Serializable]
    public struct StatData
    {
        /// <summary>
        /// The base value of the stat.
        /// </summary> 
        public float Base;

        /// <summary>
        /// The current value of the stat.
        /// </summary>
        public float Current;

        /// <summary>
        /// The maximum value the stat can reach.
        /// </summary>
        public float Max;

        /// <summary>
        /// How much the stat regenerates per second.
        /// </summary>
        public float RegenRate;

        public float BonusFlat;
        public float BonusPercent;

        /// <summary>
        /// Initializes a new stat.
        /// </summary>
        public StatData(float current, float max, float regenRate)
        {
            Base = current;
            Current = current;
            Max = max;
            RegenRate = regenRate;
            BonusFlat = 0f;
            BonusPercent = 0f;
        }


        public float EffectiveMax => Max + BonusFlat + (Max * BonusPercent);



        /// <summary>
        /// Regenerates the stat based on delta time and RegenRate.
        /// </summary>
        public void Regen(float deltaTime)
        {
            float effectiveMax = EffectiveMax;
            Current = Mathf.Min(Current + RegenRate * deltaTime, effectiveMax);
        }

        /// <summary>
        /// Modifies the stat by a value, clamped between 0 and Max.
        /// Negative values reduce, positive increase.
        /// </summary>
        public void Modify(float amount)
        {
            float effectiveMax = EffectiveMax;
            Current = Mathf.Clamp(Current + amount, 0f, effectiveMax);
        }

        public void ApplyBonus(float flat, float percent)
            {
                BonusFlat += flat;
                BonusPercent += percent;
                Current = Mathf.Clamp(Current, 0f, EffectiveMax);
            }

            public void RemoveBonus(float flat, float percent)
            {
                BonusFlat -= flat;
                BonusPercent -= percent;
                Current = Mathf.Clamp(Current, 0f, EffectiveMax);
            }
            
        /// <summary>
        /// Fully depletes the stat (Current = 0).
        /// </summary>
        public void Deplete() => Current = 0f;

        /// <summary>
        /// Fully restores the stat (Current = Max).
        /// </summary>
        public void Restore() => Current = EffectiveMax;

        /// <summary>
        /// Returns whether the stat is at its maximum.
        /// </summary>
        public bool IsFull => Mathf.Approximately(Current, EffectiveMax);

        /// <summary>
        /// Returns whether the stat is depleted.
        /// </summary>
        public bool IsEmpty => Mathf.Approximately(Current, 0f);
    }
    
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
}