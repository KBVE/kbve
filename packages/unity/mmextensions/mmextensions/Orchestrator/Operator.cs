using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator.Core.UI;

using VContainer;

namespace KBVE.MMExtensions.Orchestrator
{
    /// <summary>
    /// Central access point for orchestrator services resolved via VContainer.
    /// </summary>
    public static class Operator
    {
        public static ICharacterRegistry Registry { get; internal set; }
        public static IPrefabOrchestrator Prefab { get; internal set; }
        public static TickSystem Ticker { get; internal set; }

        public static IToastService Toast { get; internal set; }


        /// <summary>
        /// Initializes service references from VContainer.
        /// Should be called once during LifetimeScope.BuildCallback.
        /// </summary>
        public static void Init(IObjectResolver container)
        {
            Registry = container.Resolve<ICharacterRegistry>();
            Prefab = container.Resolve<IPrefabOrchestrator>();
            Ticker = container.Resolve<TickSystem>();
            Toast = container.Resolve<IToastService>();

        }
    }
}
