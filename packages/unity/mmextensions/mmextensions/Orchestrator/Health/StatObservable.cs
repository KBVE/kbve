using R3;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.Health
{
    public class StatObservable
    {
        public StatType Type;
        public ReactiveProperty<float> Current { get; } = new();
        public ReactiveProperty<float> Max { get; } = new();

        public void UpdateFrom(in StatData data)
        {
            Max.Value = data.EffectiveMax();
            Current.Value = data.Current;
        }
        public void ApplyTo(ref StatData data)
        {
            data.Current = math.clamp(Current.Value, 0f, data.EffectiveMax());
        }
    }
}