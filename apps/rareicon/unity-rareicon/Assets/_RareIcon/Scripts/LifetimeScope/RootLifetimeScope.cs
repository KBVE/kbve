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
            builder.RegisterMessageBroker<HexHoverMessage>(options);
            builder.RegisterMessageBroker<HexClickedMessage>(options);
            builder.RegisterMessageBroker<EnterTileMessage>(options);

            builder.RegisterBuildCallback(container =>
            {
                GlobalMessagePipe.SetProvider(container.AsServiceProvider());
                container.Resolve<UIPanelManager>();
                MouseStateBridge.Source = container.Resolve<IMouseStateSource>();
            });

            // -- Services --
            builder.Register<CameraService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<UiToolkitPointerBlocker>(Lifetime.Singleton).AsImplementedInterfaces();
            builder.Register<MouseStateSource>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<LocaleService>(Lifetime.Singleton);
            builder.Register<InventoryService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<ChunkGeneratorService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();

            // -- UI --
            builder.RegisterComponentOnNewGameObject<UIPanelManager>(Lifetime.Singleton, "UIPanelManager")
                .DontDestroyOnLoad()
                .AsSelf();

            // -- App state machine (DotsUI-style: single enum drives HUD visibility) --
            builder.RegisterEntryPoint<AppStateController>().AsSelf();

            // -- HUDs (VContainer-managed lifecycle, gated on AppInterfaceState) --
            builder.RegisterEntryPoint<WorldHUD>();
            builder.RegisterEntryPoint<TileHUD>();
            builder.RegisterEntryPoint<HexEnterModal>();

            // -- Entry Points --
            builder.RegisterEntryPoint<TitleEntryPoint>();

            // World rendering (ocean, hex tiles) handled by ECS systems:
            // - OceanSpawnSystem: creates ocean entity
            // - OceanTrackCameraSystem: follows camera each frame
            // - HexSpawnSystem: generates biome data + spawns hex entities
        }

        protected override void Awake()
        {
            DontDestroyOnLoad(gameObject);
            base.Awake();
        }
    }
}
