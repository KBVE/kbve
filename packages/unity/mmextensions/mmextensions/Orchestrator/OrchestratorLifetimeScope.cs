using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator.Core.UI;
using System.Linq;
using System;
using KBVE.MMExtensions.Orchestrator.Core.Quests;

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

            builder.Register<OrchestratorQuestService>(Lifetime.Singleton)
            .As<IAsyncStartable>()
            .AsSelf();   

            builder.RegisterEntryPoint<CharacterEventRegistrar>()
              .As<IDisposable>();

            //  Canvas
            builder.RegisterComponentOnNewGameObject<GlobalCanvasService>(Lifetime.Singleton, "GlobalCanvas")
                .DontDestroyOnLoad()
                .AsSelf()
                .AsImplementedInterfaces()
                .As<IAsyncStartable>()
                .As<IDisposable>();

            builder.RegisterComponentOnNewGameObject<ToastService>(Lifetime.Singleton, "ToastService")
                .DontDestroyOnLoad()
                .AsSelf()
                .AsImplementedInterfaces()
                .As<IDisposable>()
                .As<IAsyncStartable>();

            builder.RegisterComponentOnNewGameObject<HUDService>(Lifetime.Singleton, "HUDService")
                .DontDestroyOnLoad()
                .AsSelf()
                .AsImplementedInterfaces()
                .As<IAsyncStartable>()
                .As<IDisposable>();

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
