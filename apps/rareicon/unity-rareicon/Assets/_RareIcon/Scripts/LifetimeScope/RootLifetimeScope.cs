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

            var options = builder.RegisterMessagePipe();

            builder.RegisterMessageBroker<LocaleChangedMessage>(options);
            builder.RegisterMessageBroker<PanelShowMessage>(options);
            builder.RegisterMessageBroker<PanelHideMessage>(options);
            builder.RegisterMessageBroker<SettingsToggleMessage>(options);
            builder.RegisterMessageBroker<SceneLoadRequestMessage>(options);
            builder.RegisterMessageBroker<SceneLoadedMessage>(options);
            builder.RegisterMessageBroker<PlayerDamagedMessage>(options);
            builder.RegisterMessageBroker<PlayerDeathMessage>(options);
            builder.RegisterMessageBroker<HexHoverMessage>(options);
            builder.RegisterMessageBroker<HexClickedMessage>(options);
            builder.RegisterMessageBroker<EnterTileMessage>(options);
            builder.RegisterMessageBroker<ToastMessage>(options);
            builder.RegisterMessageBroker<TutorialHintMessage>(options);

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
                AppStateBridge.Source      = container.Resolve<AppStateController>();
                WorldResetBridge.Source    = container.Resolve<WorldResetService>();
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
                MultiplayerAuthorityBridge.Coordinator = container.Resolve<MultiplayerCoordinator>();
                MultiplayerAuthorityBridge.Lobby       = container.Resolve<ISteamLobbyService>();
#endif
            });

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

            builder.Register(_ => new BiomeGenerator(), Lifetime.Singleton).AsSelf();
            builder.Register<ChunkGeneratorService>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<RiverRouter>(Lifetime.Singleton).AsSelf();
            builder.Register<WorldGenSession>(Lifetime.Singleton).AsSelf().AsImplementedInterfaces();
            builder.Register<WorldResetService>(Lifetime.Singleton).AsSelf();

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

            builder.RegisterEntryPoint<MultiplayerCoordinator>(Lifetime.Singleton).AsSelf();
            builder.RegisterEntryPoint<UILobbyRoom>().AsSelf();

            builder.RegisterEntryPoint<MultiplayerLifecycleService>(Lifetime.Singleton).AsSelf();
#endif

            builder.RegisterComponentOnNewGameObject<UIPanelManager>(Lifetime.Singleton, "UIPanelManager")
                .DontDestroyOnLoad()
                .AsSelf();

            builder.RegisterEntryPoint<AppStateController>().AsSelf();

            builder.RegisterEntryPoint<UISettings>().AsSelf();

            builder.RegisterEntryPoint<ScreenFrameHost>().AsSelf();

            builder.RegisterEntryPoint<SelectionOverlay>().AsSelf();

            builder.RegisterEntryPoint<UITitleScreen>().AsSelf();

            builder.RegisterEntryPoint<UITreasury>().AsSelf();

            builder.RegisterEntryPoint<UICitizensPanel>().AsSelf();

            builder.RegisterEntryPoint<UIMilitary>().AsSelf();

            builder.RegisterEntryPoint<ToastService>().AsSelf();

            builder.RegisterEntryPoint<TutorialDriverService>().AsSelf();
            builder.RegisterEntryPoint<UITutorialHint>().AsSelf();

            builder.RegisterEntryPoint<PauseIndicator>().AsSelf();

            builder.RegisterEntryPoint<UIGameOverScreen>().AsSelf();

            builder.RegisterEntryPoint<DialogueVN>().AsSelf();
            builder.RegisterEntryPoint<DialogueBubble>();
            builder.RegisterEntryPoint<DialogueController>();

            builder.RegisterEntryPoint<WorldEventScheduler>().AsSelf();
            builder.RegisterEntryPoint<WorldEventHandler>().AsSelf();

            builder.RegisterEntryPoint<UIBuildingPalette>().AsSelf();

            builder.RegisterEntryPoint<UIBuildingInspector>().AsSelf();

            builder.RegisterEntryPoint<EscapeMenuController>();

            builder.RegisterEntryPoint<WorldHUD>();
            builder.RegisterEntryPoint<TileHUD>();
            builder.RegisterEntryPoint<HexEnterModal>();

            builder.RegisterEntryPoint<TitleEntryPoint>();

        }

        protected override void Awake()
        {
            DontDestroyOnLoad(gameObject);
            base.Awake();
        }
    }
}
