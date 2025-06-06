using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator.Core.UI;
using System.Linq;
using System;

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
        private OrchestratorBootstrapper bootstrapper;

        [Header("UI Services")]
        [SerializeField] private ToastService toastService;
        
        protected override void Awake()
        {
            base.Awake();
            DontDestroyOnLoad(this.gameObject);
        }

       
        protected override void Configure(IContainerBuilder builder)
        {
            // Serialized scene references
            builder.RegisterComponent(poolRoot);
            builder.RegisterComponent(bootstrapper).As<IAsyncStartable>();
            builder.RegisterInstance(bootstrapper.NPCLabels.ToList());

            // Service bindings
            builder.Register<ICharacterRegistry, OrchestratorCharacterData>(Lifetime.Singleton);
            builder.Register<IAddressablePrefabLoader, AddressablePrefabLoader>(Lifetime.Singleton);
            builder.Register<IPrefabOrchestrator, PrefabOrchestrator>(Lifetime.Singleton);
            builder.Register<TickSystem>(Lifetime.Singleton)
            .AsSelf()
            .AsImplementedInterfaces();

            builder.RegisterEntryPoint<CharacterEventRegistrar>();

            // [With Toast]
            // Fails at RunTime builder.RegisterComponentInHierarchy<ToastService>().AsSelf().AsImplementedInterfaces();
            // builder.RegisterComponent(toastService).As<ToastService>().AsSelf();
            builder.RegisterComponent(toastService).AsSelf().AsImplementedInterfaces().As<IDisposable>();

            // === NPC Orchestrator === ! Can Break at Register the shared NPCDefinitionDatabase (manually assigned in scene or loaded)
            if (npcDefinitionDatabase == null)
            {
                Debug.LogError("[OrchestratorLifetimeScope] NPCDefinitionDatabase is not assigned in the Inspector.");
            }
            else
            {
                builder.RegisterInstance<INPCDefinitionDatabase>(npcDefinitionDatabase).AsSelf();
            }

            builder.Register<NPCGlobalController>(Lifetime.Singleton).As<INPCGlobalController>().AsSelf(); ;

            builder.Register<OrchestratorNPCGlobals>(Lifetime.Singleton)
                .As<IAsyncStartable>();

            builder.Register<NPCFactory>(Lifetime.Singleton)
                .As<INPCFactory>();

            // [With Operator]
            builder.RegisterBuildCallback(container =>
            {
                Operator.Init(container);
                TickLocator.Initialize(Operator.Ticker);

                if (TickLocator.Instance == null)
                {
                    Debug.LogError("TickSystem failed to initialize.");
                }
            });


        }
    }
}
