using R3;

namespace KBVE.MMExtensions.Orchestrator.Health
{
    public class StatObservable
    {
        public StatType Type;
        public ReactiveProperty<float> Current { get; } = new();
        public ReactiveProperty<float> Max { get; } = new();

        public void UpdateFrom(StatData data)
        {
            Max.Value = data.EffectiveMax;
            Current.Value = data.Current;
        }
    }
}