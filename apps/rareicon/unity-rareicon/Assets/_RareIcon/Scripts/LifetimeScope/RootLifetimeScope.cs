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
            builder.RegisterMessageBroker<ToastMessage>(options);

            // Click-router output — AppStateController emits one of these
            // per left-click after deciding what the click MEANS. Subscribers
            // (ControlledUnitCommandSystem, PossessSystem, future Building
            // Inspector) then act only on the semantic event they care about
            // instead of every raw HexClickedMessage.
            builder.RegisterMessageBroker<BuildingInspectMessage>(options);
            builder.RegisterMessageBroker<PossessUnitMessage>(options);
            builder.RegisterMessageBroker<ControlledUnitMoveMessage>(options);

            builder.RegisterBuildCallback(container =>
            {
                GlobalMessagePipe.SetProvider(container.AsServiceProvider());
                container.Resolve<UIPanelManager>();
                MouseStateBridge.Source    = container.Resolve<IMouseStateSource>();
                BuildModeBridge.Source     = container.Resolve<BuildModeController>();
                ActivityFeedBridge.Source  = container.Resolve<ActivityFeedService>();
            });

            // -- Services --
            builder.Register<CameraService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<UiToolkitPointerBlocker>(Lifetime.Singleton).AsImplementedInterfaces();
            builder.Register<MouseStateSource>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<BuildModeController>(Lifetime.Singleton).AsSelf();
            // EntryPoints so VContainer's player-loop runner ticks the
            // keyboard Tick() each frame and the click-handler subscribes
            // on startup — same lifecycle hook as the HUD / AppStateController
            // entry points below.
            builder.RegisterEntryPoint<BuildInputSource>();
            builder.RegisterEntryPoint<BuildCommandHandler>();
            builder.Register<LocaleService>(Lifetime.Singleton);
            builder.Register<ActivityFeedService>(Lifetime.Singleton).AsSelf();
            builder.Register<InventoryService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            // Factory so VContainer doesn't try to resolve the int defaults.
            builder.Register(_ => new BiomeGenerator(), Lifetime.Singleton).AsSelf();
            builder.Register<ChunkGeneratorService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<RiverRouter>(Lifetime.Singleton).AsSelf();

            // -- UI --
            builder.RegisterComponentOnNewGameObject<UIPanelManager>(Lifetime.Singleton, "UIPanelManager")
                .DontDestroyOnLoad()
                .AsSelf();

            // -- App state machine (DotsUI-style: single enum drives HUD visibility) --
            builder.RegisterEntryPoint<AppStateController>().AsSelf();

            // -- Settings window (tabbed; first tab is world Search) --
            builder.RegisterEntryPoint<UISettings>().AsSelf();

            // -- Screen frame (root layout regions; mount FIRST so other
            //    panels can await its Ready and grab region refs) --
            builder.RegisterEntryPoint<ScreenFrameHost>().AsSelf();

            // -- Treasury panel (capital storage viewer) --
            builder.RegisterEntryPoint<UITreasury>().AsSelf();

            // -- Citizens panel (tabbed: Jobs, Roster, ...) --
            builder.RegisterEntryPoint<UICitizensPanel>().AsSelf();

            // -- Military panel (quick list of armed Player units) --
            builder.RegisterEntryPoint<UIMilitary>().AsSelf();

            // -- Toast notification service (pool + queue, bottom-center) --
            builder.RegisterEntryPoint<ToastService>().AsSelf();

            // -- Building palette panel (per-type cost + affordability) --
            builder.RegisterEntryPoint<UIBuildingPalette>().AsSelf();

            // -- Building inspector (auto-opens on click router's
            //    BuildingInspectMessage; closes via X button) --
            builder.RegisterEntryPoint<UIBuildingInspector>().AsSelf();

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
