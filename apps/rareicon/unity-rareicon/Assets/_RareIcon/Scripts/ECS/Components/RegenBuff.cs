using Unity.Entities;

namespace RareIcon
{
    /// <summary>Heal-over-time applied by a MedKit (or any item with RegenPerSecond + RegenDuration). Added or refreshed by BarracksHealExecutor; ticks down via RegenBuffSystem which writes Health each frame and removes the component when TimeRemaining hits zero. Refreshing an active buff takes the max of remaining-duration and new-duration so a second MedKit extends rather than overwrites.</summary>
    public struct RegenBuff : IComponentData
    {
        public float AmountPerSecond;
        public float TimeRemaining;
    }
}
