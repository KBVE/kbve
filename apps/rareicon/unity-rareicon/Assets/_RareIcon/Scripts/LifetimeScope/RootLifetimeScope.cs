using UnityEngine;
using VContainer;
using VContainer.Unity;
using MessagePipe;
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
using RareIcon.Platform;
#endif

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

            builder.RegisterMessageBroker<BuildingInspectMessage>(options);
            builder.RegisterMessageBroker<LandmarkInspectMessage>(options);
            builder.RegisterMessageBroker<PossessUnitMessage>(options);
            builder.RegisterMessageBroker<UnitInspectMessage>(options);
            builder.RegisterMessageBroker<ControlledUnitMoveMessage>(options);

            builder.RegisterMessageBroker<SelectionDragMessage>(options);
            builder.RegisterMessageBroker<SelectionMoveMessage>(options);

            builder.RegisterMessageBroker<InventoryChangedMessage>(options);
            builder.RegisterMessageBroker<ProfessionChangedMessage>(options);
            builder.RegisterMessageBroker<HexChangedMessage>(options);

            builder.RegisterMessageBroker<BuildingSpawnedMessage>(options);
            builder.RegisterMessageBroker<BuildingConstructionCompleteMessage>(options);
            builder.RegisterMessageBroker<BuildingTierChangedMessage>(options);
            builder.RegisterMessageBroker<BuildingDamagedMessage>(options);
            builder.RegisterMessageBroker<BuildingRepairedMessage>(options);
            builder.RegisterMessageBroker<BuildingDestroyedMessage>(options);
            builder.RegisterMessageBroker<BuildingDemolishedMessage>(options);

            builder.RegisterMessageBroker<DialogueStartMessage>(options);
            builder.RegisterMessageBroker<DialogueAdvanceMessage>(options);
            builder.RegisterMessageBroker<DialogueChoiceMessage>(options);
            builder.RegisterMessageBroker<DialogueCancelMessage>(options);
            builder.RegisterMessageBroker<DialogueEndedMessage>(options);
            builder.RegisterMessageBroker<SpeechBubbleMessage>(options);

            builder.RegisterMessageBroker<QuestStartedMessage>(options);
            builder.RegisterMessageBroker<QuestCompletedMessage>(options);
            builder.RegisterMessageBroker<QuestFailedMessage>(options);

            builder.RegisterMessageBroker<WorldEventTriggeredMessage>(options);
            builder.RegisterMessageBroker<LandmarkDemolishedEvent>(options);

            // -- Steam platform events (standalone-only; stripped on iOS/Android via asmdef) --
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
            builder.RegisterMessageBroker<SteamLobbyCreatedMessage>(options);
            builder.RegisterMessageBroker<SteamLobbyJoinedMessage>(options);
            builder.RegisterMessageBroker<SteamLobbyLeftMessage>(options);
            builder.RegisterMessageBroker<SteamLobbyMemberChangedMessage>(options);
            builder.RegisterMessageBroker<SteamLobbyInviteMessage>(options);
            builder.RegisterMessageBroker<SteamJoinRequestedMessage>(options);
            builder.RegisterMessageBroker<SteamLobbyDataChangedMessage>(options);
            builder.RegisterMessageBroker<SteamNetworkPacketMessage>(options);
            builder.RegisterMessageBroker<SteamNetworkSessionRequestMessage>(options);
            builder.RegisterMessageBroker<SteamNetworkSessionFailedMessage>(options);
            builder.RegisterMessageBroker<SteamAvatarReadyMessage>(options);
            builder.RegisterMessageBroker<SteamLobbyBrowserResultMessage>(options);
#endif

            builder.RegisterBuildCallback(container =>
            {
                GlobalMessagePipe.SetProvider(container.AsServiceProvider());
                container.Resolve<UIPanelManager>();
                MouseStateBridge.Source    = container.Resolve<IMouseStateSource>();
                BuildModeBridge.Source     = container.Resolve<BuildModeController>();
                ActivityFeedBridge.Source  = container.Resolve<ActivityFeedService>();
                PauseBridge.Source         = container.Resolve<PauseService>();
            });

            // -- Services --
            builder.Register<CameraService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<UiToolkitPointerBlocker>(Lifetime.Singleton).AsImplementedInterfaces();
            builder.Register<MouseStateSource>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<BuildModeController>(Lifetime.Singleton).AsSelf();
            builder.RegisterEntryPoint<BuildInputSource>();
            builder.RegisterEntryPoint<BuildCommandHandler>();
            builder.RegisterEntryPoint<LandmarkInspectorService>();
            builder.RegisterEntryPoint<LandmarkInteractSystem>();

            builder.RegisterEntryPoint<DragSelectInput>();
            builder.RegisterEntryPoint<SelectionController>().AsSelf();
            builder.RegisterEntryPoint<SelectionMoveHandler>();
            builder.RegisterEntryPoint<SelectionInput>();
            builder.Register<LocaleService>(Lifetime.Singleton);
            builder.Register<PauseService>(Lifetime.Singleton).AsSelf();
            builder.Register<ActivityFeedService>(Lifetime.Singleton).AsSelf();
            builder.Register<InventoryService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            // Factory so VContainer doesn't try to resolve the int defaults.
            builder.Register(_ => new BiomeGenerator(), Lifetime.Singleton).AsSelf();
            builder.Register<ChunkGeneratorService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<RiverRouter>(Lifetime.Singleton).AsSelf();
            builder.Register<WorldGenSession>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();

            // -- Steam services (standalone-only; entire RareIcon.Platform asmdef
            //    is excluded on iOS/Android/WebGL targets) --
            // SteamManager itself self-bootstraps via RuntimeInitializeOnLoad —
            // these are the managed service facades that consume its callbacks.
            // RegisterEntryPoint wires IStartable (callback subscription),
            // ITickable (per-frame message polling), and IDisposable (cleanup).
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
            builder.RegisterEntryPoint<SteamLobbyService>(Lifetime.Singleton)
                .AsSelf().As<ISteamLobbyService>();
            builder.RegisterEntryPoint<SteamNetworkingService>(Lifetime.Singleton)
                .AsSelf().As<ISteamNetworkingService>();
            builder.RegisterEntryPoint<SteamPresenceService>(Lifetime.Singleton)
                .AsSelf().As<ISteamPresenceService>();
            builder.RegisterEntryPoint<SteamTransportRouter>(Lifetime.Singleton)
                .AsSelf().As<ISteamTransportRouter>();
            builder.RegisterEntryPoint<SteamAchievementsService>(Lifetime.Singleton)
                .AsSelf().As<ISteamAchievementsService>();
            builder.RegisterEntryPoint<SteamAvatarService>(Lifetime.Singleton)
                .AsSelf().As<ISteamAvatarService>();
            builder.RegisterEntryPoint<SteamLobbyBrowserService>(Lifetime.Singleton)
                .AsSelf().As<ISteamLobbyBrowserService>();
#endif

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

            builder.RegisterEntryPoint<SelectionOverlay>().AsSelf();

            // -- Title screen (locale → seed → background gen → start) --
            builder.RegisterEntryPoint<UITitleScreen>().AsSelf();

            // -- Treasury panel (capital storage viewer) --
            builder.RegisterEntryPoint<UITreasury>().AsSelf();

            // -- Citizens panel (tabbed: Jobs, Roster, ...) --
            builder.RegisterEntryPoint<UICitizensPanel>().AsSelf();

            // -- Military panel (quick list of armed Player units) --
            builder.RegisterEntryPoint<UIMilitary>().AsSelf();

            // -- Toast notification service (pool + queue, bottom-center) --
            builder.RegisterEntryPoint<ToastService>().AsSelf();

            // -- Pause indicator (top-right overlay + F9 debug toggle) --
            builder.RegisterEntryPoint<PauseIndicator>().AsSelf();

            // -- Dialogue: VN renderer is DI-resolvable so the controller
            //    can drive it directly; bubble + controller are pure
            //    entry points that self-manage via the message bus. --
            builder.RegisterEntryPoint<DialogueVN>().AsSelf();
            builder.RegisterEntryPoint<DialogueBubble>();
            builder.RegisterEntryPoint<DialogueController>();

            // -- Random world events (dispatcher + handler) --
            builder.RegisterEntryPoint<WorldEventScheduler>().AsSelf();
            builder.RegisterEntryPoint<WorldEventHandler>().AsSelf();

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
