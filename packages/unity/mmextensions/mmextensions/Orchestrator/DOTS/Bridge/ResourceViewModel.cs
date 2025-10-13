using R3;
using System;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    /// <summary>
    /// Thread-safe reactive view model for the currently selected resource.
    /// This bridges ECS → main thread → OneJS/TS UI.
    /// </summary>
    public sealed class ResourceViewModel : IDisposable
    {
        public static ResourceViewModel Instance { get; private set; }


        /// <summary>
        /// Reactive stream of the current Resource snapshot (null = none selected).
        /// </summary>
        public SynchronizedReactiveProperty<ResourceBlit?> Current { get; }
            = new SynchronizedReactiveProperty<ResourceBlit?>(null);


        public ResourceViewModel() => Instance = this;
  
        /// <summary>
        /// Release any subscriptions (if container disposes this singleton).
        /// </summary>
        public void Dispose()
        {
            Current.Dispose();
        }
    }
}
