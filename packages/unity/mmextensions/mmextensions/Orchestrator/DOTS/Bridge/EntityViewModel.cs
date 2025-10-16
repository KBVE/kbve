using R3;
using System;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    /// <summary>
    /// Thread-safe reactive view model for the currently selected entites.
    /// This bridges ECS → main thread → OneJS/TS UI.
    /// </summary>
    public sealed class EntityViewModel : IDisposable
    {
        public static EntityViewModel Instance { get; private set; }

        // Thread-safe reactive property for multi-threaded access
        public SynchronizedReactiveProperty<EntityBlitContainer?> Current = new SynchronizedReactiveProperty<EntityBlitContainer?>(null);

        // View
        public EntityViewModel() => Instance = this;
          
        /// <summary>
        /// Release any subscriptions (if container disposes this singleton).
        /// </summary>
        public void Dispose()
        {
            Current.Dispose();
        }
    }
}