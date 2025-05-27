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

        /// <summary>
        /// Initializes a new stat.
        /// </summary>
        public StatData(float current, float max, float regenRate)
        {
            Current = current;
            Max = max;
            RegenRate = regenRate;
        }

        /// <summary>
        /// Regenerates the stat based on delta time and RegenRate.
        /// </summary>
        public void Regen(float deltaTime)
        {
            Current = Mathf.Min(Current + RegenRate * deltaTime, Max);
        }

        /// <summary>
        /// Modifies the stat by a value, clamped between 0 and Max.
        /// Negative values reduce, positive increase.
        /// </summary>
        public void Modify(float amount)
        {
            Current = Mathf.Clamp(Current + amount, 0f, Max);
        }

        /// <summary>
        /// Fully depletes the stat (Current = 0).
        /// </summary>
        public void Deplete() => Current = 0f;

        /// <summary>
        /// Fully restores the stat (Current = Max).
        /// </summary>
        public void Restore() => Current = Max;

        /// <summary>
        /// Returns whether the stat is at its maximum.
        /// </summary>
        public bool IsFull => Mathf.Approximately(Current, Max);

        /// <summary>
        /// Returns whether the stat is depleted.
        /// </summary>
        public bool IsEmpty => Mathf.Approximately(Current, 0f);
    }
}