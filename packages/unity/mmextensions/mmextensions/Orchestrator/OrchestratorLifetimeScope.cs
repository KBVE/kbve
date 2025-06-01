using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator.Core.UI;

namespace KBVE.MMExtensions.Orchestrator
{
    public class OrchestratorLifetimeScope : LifetimeScope
    {
        [Header("References")]
        [SerializeField]
        private Transform poolRoot;

        [SerializeField]
        private NPCDefinitionDatabase npcDefinitionDatabase;

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

            builder.RegisterEntryPoint<CharacterEventRegistrar>();

            // [With Toast]
            builder.RegisterComponentInHierarchy<ToastService>().AsSelf().AsImplementedInterfaces();


            // === NPC Orchestrator === ! Can Break at Register the shared NPCDefinitionDatabase (manually assigned in scene or loaded)
            if (npcDefinitionDatabase == null)
            {
                Debug.LogError("[OrchestratorLifetimeScope] NPCDefinitionDatabase is not assigned in the Inspector.");
            }
            else
            {
                builder.RegisterInstance<INPCDefinitionDatabase>(npcDefinitionDatabase);
            }

            builder.Register<NPCGlobalController>(Lifetime.Singleton).As<INPCGlobalController>();

            builder.Register<OrchestratorNPCGlobals>(Lifetime.Singleton)
                .As<IAsyncStartable>();

            builder.Register<NPCFactory>(Lifetime.Singleton)
                .As<INPCFactory>();

            // [With Operator]
            builder.RegisterBuildCallback(container =>
            {
                // Initialize the static Operator class with service references
                Operator.Init(container);

                // Still support the TickLocator if needed
                TickLocator.Initialize(Operator.Ticker);

                if (TickLocator.Instance == null)
                {
                    Debug.LogError("TickSystem failed to initialize.");
                }
            });

            // [Without Operator]
            // builder.RegisterBuildCallback(container =>
            // {
            //     var tickSystem = container.Resolve<TickSystem>();
            //     TickLocator.Initialize(tickSystem);

            //     if (TickLocator.Instance == null)
            //     {
            //         Debug.LogError("TickSystem failed to initialize.");
            //     }
            // });

        }
    }
}
