using UnityEngine;
using VContainer;
using VContainer.Unity;
using MessagePipe;

namespace RareIcon
{
    public class RootLifetimeScope : LifetimeScope
    {
        protected override void Configure(IContainerBuilder builder)
        {
            // -- MessagePipe --
            var options = builder.RegisterMessagePipe();

            builder.RegisterMessageBroker<LocaleChangedMessage>(options);
            builder.RegisterMessageBroker<PanelShowMessage>(options);
            builder.RegisterMessageBroker<PanelHideMessage>(options);
            builder.RegisterMessageBroker<SceneLoadRequestMessage>(options);
            builder.RegisterMessageBroker<SceneLoadedMessage>(options);
            builder.RegisterMessageBroker<PlayerDamagedMessage>(options);
            builder.RegisterMessageBroker<PlayerDeathMessage>(options);

            builder.RegisterBuildCallback(container =>
            {
                GlobalMessagePipe.SetProvider(container.AsServiceProvider());
                container.Resolve<OceanBackground>();
                container.Resolve<HexBiomeLayer>();
                container.Resolve<UIPanelManager>();
            });

            // -- Services --
            builder.Register<CameraService>(Lifetime.Singleton);
            builder.Register<LocaleService>(Lifetime.Singleton);
            builder.Register<InventoryService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();

            // -- World (loaded on title for early rendering) --
            builder.RegisterComponentOnNewGameObject<OceanBackground>(Lifetime.Singleton, "OceanBackground")
                .DontDestroyOnLoad()
                .AsSelf();

            builder.RegisterComponentOnNewGameObject<HexBiomeLayer>(Lifetime.Singleton, "HexBiomeLayer")
                .DontDestroyOnLoad()
                .AsSelf();

            // -- UI --
            builder.RegisterComponentOnNewGameObject<UIPanelManager>(Lifetime.Singleton, "UIPanelManager")
                .DontDestroyOnLoad()
                .AsSelf();

            // -- Entry Points --
            builder.RegisterEntryPoint<TitleEntryPoint>();
        }

        protected override void Awake()
        {
            DontDestroyOnLoad(gameObject);
            base.Awake();
        }
    }
}
