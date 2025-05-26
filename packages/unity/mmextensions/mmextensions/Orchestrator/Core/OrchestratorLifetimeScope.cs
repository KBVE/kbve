using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtension.Orchestrator.Interfaces;
using KBVE.MMExtension.Orchestrator.Core;

namespace KBVE.MMExtension.Orchestrator
{
    public class OrchestratorLifetimeScope : LifetimeScope
    {
        [Header("References")]
        [SerializeField]
        private Transform poolRoot;

        [Header("Injectables")]
        [SerializeField]
        private MonoBehaviour bootstrapper;

        protected override void Configure(IContainerBuilder builder)
        {
            // Serialized scene references
            builder.RegisterComponent(poolRoot);
            builder.RegisterComponent(bootstrapper);

            // Service bindings
            builder.Register<IAddressablePrefabLoader, AddressablePrefabLoader>(Lifetime.Singleton);
            builder.Register<IPrefabOrchestrator, PrefabOrchestrator>(Lifetime.Singleton);
        }
    }
}
