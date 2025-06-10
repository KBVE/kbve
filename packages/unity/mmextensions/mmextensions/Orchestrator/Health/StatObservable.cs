using R3;
using Unity.Mathematics;
using System;
using Cysharp.Threading.Tasks;


namespace KBVE.MMExtensions.Orchestrator.Health
{
    public class StatObservable : IDisposable
    {
        public StatType Type;
        public ReactiveProperty<float> Current { get; } = new();
        public ReactiveProperty<float> Max { get; } = new();

        private Func<StatData> _getter;
        private readonly CompositeDisposable _disposables = new();

        public void Bind(Func<StatData> getter)
        {
            _getter = getter;
            _disposables.Clear();
            _disposables.Add(
                Observable
                    .IntervalFrame(30)
                    .Subscribe(_ =>
                        {
                            var data = _getter();
                            Max.Value = data.EffectiveMax();
                            Current.Value = data.Current;
                        })
            );
        }
        public void UpdateFrom(in StatData data)
        {
            Max.Value = data.EffectiveMax();
            Current.Value = data.Current;
        }
        public void ApplyTo(ref StatData data)
        {
            data.Current = math.clamp(Current.Value, 0f, data.EffectiveMax());
        }

        public void Unbind()
        {
            _disposables.Clear();
            _getter = null;
        }

        public void Rebind(Func<StatData> newGetter)
        {
            Unbind();
            Bind(newGetter);
        }

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}