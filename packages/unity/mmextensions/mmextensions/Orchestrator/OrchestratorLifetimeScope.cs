using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;

namespace KBVE.MMExtensions.Orchestrator
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
            builder.Register<ICharacterRegistry, OrchestratorCharacterData>(Lifetime.Singleton);
            builder.Register<IAddressablePrefabLoader, AddressablePrefabLoader>(Lifetime.Singleton);
            builder.Register<IPrefabOrchestrator, PrefabOrchestrator>(Lifetime.Singleton);
            builder.Register<TickSystem>(Lifetime.Singleton)
            .AsSelf()
            .AsImplementedInterfaces();

            builder.RegisterComponentOnNewGameObject<CharacterEventRegistrar>(
                Lifetime.Singleton,
                "CharacterEventRegistrar"
            );

            builder.RegisterBuildCallback(container =>
            {
                var tickSystem = container.Resolve<TickSystem>();
                TickLocator.Initialize(tickSystem);

                if (TickLocator.Instance == null)
                {
                    Debug.LogError("TickSystem failed to initialize.");
                }
            });

        }
    }
}
