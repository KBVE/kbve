using R3;
using System;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public sealed class ResourceViewModel : System.IDisposable
    {
        public SynchronizedReactiveProperty<ResourceBlit?> Current { get; } = new();
        public void Dispose() => Current.Dispose();
    }
}