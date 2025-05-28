using KBVE.MMExtensions.Orchestrator.Core;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    /// <summary>
    /// Static locator for the TickSystem, used to bridge DI gaps when VContainer injection isn't available (e.g., external prefab spawns).
    /// </summary>
    public static class TickLocator
    {
        public static TickSystem Instance { get; private set; }

        public static void Initialize(TickSystem system)
        {
            Instance = system;
        }
    }
}