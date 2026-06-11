#include "chuckCorePlayerController.h"

#include "chuckCoreCharacter.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "chuckHUDState.h"
#include "chuckInputs.h"
#include "EnhancedInputComponent.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "chuckEventPayloads.h"
#include "chuckUIEvents.h"
#include "Props/chuckArcadeCabinet.h"
#include "NPC/chuckSpriteNPC.h"
#include "NPC/chuckNpcSpawner.h"
#include "Mass/chuckSlimeSubsystem.h"
#include "NavigationSystem.h"
#include "SKBVEDevOverlay.h"
#include "GameFramework/PlayerState.h"
#include "MassEntitySubsystem.h"
#include "MassEntityManager.h"
#include "SchuckHotbar.h"
#include "SchuckHUD.h"
#include "ChuckUIStyle.h"
#include "SchuckInventoryWindow.h"
#include "SKBVELoginWidget.h"
#include "SKBVEAccountPanel.h"
#include "SKBVEChatPanel.h"
#include "chuckSettings.h"
#include "SchuckPauseMenu.h"
#include "chuckInventory.h"
#include "chuckItemDB.h"
#include "KBVEItemTypes.h"
#include "Engine/GameInstance.h"
#include "SKBVEDragArrowLayer.h"
#include "SKBVETooltip.h"
#include "SKBVESettingsFrame.h"
#include "SKBVESettingsToggleRow.h"
#include "SKBVESettingsSliderRow.h"
#include "SKBVESettingsComboRow.h"
#include "SchuckToastHost.h"
#include "Engine/Engine.h"
#include "GameFramework/GameUserSettings.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"
#include "chuckNoise.h"
#include "chuckTerrainStreamer.h"
#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseChat.h"
#include "KBVESupabaseTypes.h"

namespace
{
	const FName ChatWindowKey = TEXT("chuck.chat");
}

AchuckCorePlayerController::AchuckCorePlayerController()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;
}

void AchuckCorePlayerController::PostInitializeComponents()
{
	Super::PostInitializeComponents();

	if (UchuckInputs* Inputs = UchuckInputs::Get())
	{
		DefaultMappingContexts.Reset();
		MobileExcludedMappingContexts.Reset();
		if (Inputs->DefaultIMC)
		{
			DefaultMappingContexts.Add(Inputs->DefaultIMC);
		}
	}
}

void AchuckCorePlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();

	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(InputComponent))
	{
		if (UchuckInputs* Inputs = UchuckInputs::Get())
		{
			if (Inputs->Pause)
			{
				EIC->BindAction(Inputs->Pause, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnPausePressed);
			}
			if (Inputs->ToggleSettings)
			{
				EIC->BindAction(Inputs->ToggleSettings, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnToggleSettingsPressed);
			}
			if (Inputs->ToggleDevOverlay)
			{
				EIC->BindAction(Inputs->ToggleDevOverlay, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnToggleDevOverlayPressed);
			}
			if (Inputs->Inventory)
			{
				EIC->BindAction(Inputs->Inventory, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnInventoryPressed);
			}
			if (Inputs->ToggleChat)
			{
				EIC->BindAction(Inputs->ToggleChat, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnToggleChatPressed);
			}
			if (Inputs->FocusChat)
			{
				EIC->BindAction(Inputs->FocusChat, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnFocusChatPressed);
			}
			if (Inputs->Interact)
			{
				EIC->BindAction(Inputs->Interact, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnInteractPressed);
			}
		}
	}
}

void AchuckCorePlayerController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);

	if (!IsLocalPlayerController())
	{
		return;
	}

	if (UClass* BPClass = LoadClass<AchuckArcadeCabinet>(nullptr, TEXT("/Game/Art/Furniture/Arcade/BP_ArcadeCabinet.BP_ArcadeCabinet_C")))
	{
		CachedArcadeClass = BPClass;
		UE_LOG(LogTemp, Display, TEXT("[chuck] CorePC preloaded BP_ArcadeCabinet"));
	}
	else
	{
		CachedArcadeClass = AchuckArcadeCabinet::StaticClass();
		UE_LOG(LogTemp, Warning, TEXT("[chuck] CorePC fallback to C++ AchuckArcadeCabinet (BP missing)"));
	}

	AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(InPawn);
	if (!Char)
	{
		return;
	}

	if (HUDWidget.IsValid())
	{
		return;
	}

	{
		const uint32 SpawnSeed   = 0xC1A55E5Au;
		const FVector AnchorXY   = FVector(0.f, 0.f, 0.f);
		const float Sampled      = chuckNoise::Heightmap(AnchorXY.X, AnchorXY.Y, SpawnSeed);
		const float HoverZ       = Sampled + 5000.f;
		const FVector SpawnTarget(AnchorXY.X, AnchorXY.Y, HoverZ);

		if (UWorld* W = GetWorld())
		{
			if (UchuckTerrainStreamer* Streamer = W->GetSubsystem<UchuckTerrainStreamer>())
			{
				Streamer->SetSeed(SpawnSeed);
				Streamer->EnsureBuiltAround(FVector2D(AnchorXY.X, AnchorXY.Y));
			}
		}

		const FVector PawnIn = Char->GetActorLocation();
		const bool bOk = Char->TeleportTo(SpawnTarget, Char->GetActorRotation(), false, true);
		if (UCharacterMovementComponent* CM = Char->GetCharacterMovement())
		{
			CM->StopMovementImmediately();
			CM->Velocity = FVector::ZeroVector;
			CM->GravityScale = 0.f;
		}

		bSpawnSnapPending = true;
		SpawnSnapElapsed  = 0.f;
		SpawnSnapSeed     = SpawnSeed;
		SpawnSnapAnchor   = FVector2D(AnchorXY.X, AnchorXY.Y);

		UE_LOG(LogTemp, Display,
			TEXT("[chuck] CorePC spawn anchor=(%.0f,%.0f) sampled=%.0f hoverZ=%.0f pawnIn=(%.0f,%.0f,%.0f) teleportOk=%d pawnOut=(%.0f,%.0f,%.0f) snap=armed"),
			AnchorXY.X, AnchorXY.Y, Sampled, HoverZ,
			PawnIn.X, PawnIn.Y, PawnIn.Z,
			bOk ? 1 : 0,
			Char->GetActorLocation().X, Char->GetActorLocation().Y, Char->GetActorLocation().Z);
	}

	HUDWidget    = SNew(SchuckHUD).OwningCharacter(Char);
	HotbarWidget = SNew(SchuckHotbar).OwningCharacter(Char);
	TooltipWidget = SNew(SKBVETooltip);
	DragArrowLayer = SNew(SKBVEDragArrowLayer);
	ToastHostWidget = SNew(SchuckToastHost).OwningCharacter(Char);

	if (UGameInstance* GI = GetGameInstance())
	{
		SupabaseSubsystem = GI->GetSubsystem<UKBVESupabaseSubsystem>();
	}

	AccountWidget = SNew(SKBVEAccountPanel).Subsystem(SupabaseSubsystem);

	const ISlateStyle& UIStyle = FChuckUIStyle::Get();
	const float StatBarHeight  = UIStyle.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Height);
	const float StatBarSpacing = UIStyle.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Spacing);
	const FMargin StatPadding  = UIStyle.GetMargin(FChuckUIStyle::FKeys::HUD_Padding);
	constexpr int32 StatBarCount = 3;
	constexpr float ChatDockGap  = 16.f;
	const float StatStackHeight  = StatBarHeight * StatBarCount + StatBarSpacing * (StatBarCount - 1);
	const FMargin ChatDockPadding(StatPadding.Left, 0.f, 0.f, StatPadding.Bottom + StatStackHeight + ChatDockGap);

	ChatWidget    = SNew(SKBVEChatPanel)
		.Subsystem(SupabaseSubsystem)
		.DockPadding(ChatDockPadding)
		.OnCloseClicked(FSimpleDelegate::CreateLambda([this]()
		{
			SetUiFlag(EUiFlag::Chat, false);
			RefreshUiMouseMode();
		}))
		.OnSaveGeometry(FKBVEChatGeometrySave::CreateLambda([this](const FVector2D& Pos, const FVector2D& Size)
		{
			if (UchuckSettings* S = UchuckSettings::Get(this))
			{
				FchuckWindowGeometry G;
				G.WindowKey = ChatWindowKey;
				G.Position  = Pos;
				G.Size      = Size;
				S->SetWindowGeometry(G);
			}
		}))
		.OnLoadGeometry(FKBVEChatGeometryLoad::CreateLambda([this](FVector2D& OutPos, FVector2D& OutSize) -> bool
		{
			if (UchuckSettings* S = UchuckSettings::Get(this))
			{
				FchuckWindowGeometry G;
				if (S->GetWindowGeometry(ChatWindowKey, G))
				{
					OutPos  = G.Position;
					OutSize = G.Size;
					return true;
				}
			}
			return false;
		}));

	if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
	{
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), HUDWidget.ToSharedRef(),       5);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), HotbarWidget.ToSharedRef(),    20);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), DragArrowLayer.ToSharedRef(), 29);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), TooltipWidget.ToSharedRef(),  30);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), ToastHostWidget.ToSharedRef(),32);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), ChatWidget.ToSharedRef(),     35);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), AccountWidget.ToSharedRef(),  40);
	}

	ApplyUiFlagsVisibility();

	InitSupabaseBridge();

	if (UGameInstance* GI = GetGameInstance())
	{
		if (UchuckItemDB* DB = GI->GetSubsystem<UchuckItemDB>())
		{
			DB->GetTranslucentBillboardMaterial();
			DB->GetRadialDiscTexture();
			const FchuckInventory& Inv = Char->GetInventory();
			auto WarmBag = [&](const TArray<FchuckInventoryStack>& Slots)
			{
				for (const FchuckInventoryStack& S : Slots)
				{
					if (S.IsEmpty()) continue;
					const FKBVEItemDef* Def = DB->LookupByKey(S.ItemKey);
					if (!Def) continue;
					DB->GetIconMID(S.ItemKey);
					DB->GetHaloMID(Def->Rarity, KBVEItem::RarityColor(Def->Rarity));
				}
			};
			WarmBag(Inv.DefaultBag.Slots);
			WarmBag(Inv.Hotbar.Slots);
		}
	}

	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FKBVEEventHandle H = Bus->Tooltip.Subscribe(this, [this](const FchuckTooltipPayload& P)
		{
			bPendingTooltipShow      = P.bShow;
			bPendingTooltipDirty     = true;
			if (P.bShow)
			{
				PendingTooltipTitle       = P.Text;
				PendingTooltipSubtitle    = P.Subtitle;
				PendingTooltipBody        = P.Body;
				PendingTooltipTitleColor  = P.TitleColor;
				PendingTooltipBorderColor = P.BorderColor;
				PendingTooltipPos         = P.ScreenPos;
			}
		});
		TooltipHandleId = H.Id;
	}
}

void AchuckCorePlayerController::OnUnPossess()
{
	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;

	TearDownSupabaseBridge();

	if (AccountWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), AccountWidget.ToSharedRef());
		AccountWidget.Reset();
	}
	if (ChatWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), ChatWidget.ToSharedRef());
		ChatWidget.Reset();
	}

	if (TooltipHandleId != 0)
	{
		if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
		{
			Bus->Tooltip.Unsubscribe({ TooltipHandleId });
		}
		TooltipHandleId = 0;
	}
	if (TooltipWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), TooltipWidget.ToSharedRef());
		TooltipWidget.Reset();
	}
	if (DragArrowLayer.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), DragArrowLayer.ToSharedRef());
		DragArrowLayer.Reset();
	}
	if (InventoryWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), InventoryWidget.ToSharedRef());
		InventoryWidget.Reset();
		SetUiFlag(EUiFlag::Inventory, false);
	}
	if (HotbarWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), HotbarWidget.ToSharedRef());
		HotbarWidget.Reset();
	}
	if (HUDWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), HUDWidget.ToSharedRef());
		HUDWidget.Reset();
	}
	if (ToastHostWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), ToastHostWidget.ToSharedRef());
		ToastHostWidget.Reset();
	}
	if (SettingsWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), SettingsWidget.ToSharedRef());
		SettingsWidget.Reset();
		SetUiFlag(EUiFlag::Settings, false);
	}
	Super::OnUnPossess();
}

void AchuckCorePlayerController::OnPausePressed(const FInputActionValue& Value)
{
	if (HasUiFlag(EUiFlag::Pause))
	{
		ResumeGame();
	}
	else
	{
		PauseGame();
	}
}

void AchuckCorePlayerController::OnToggleSettingsPressed(const FInputActionValue& Value)
{
	ToggleSettings();
}

void AchuckCorePlayerController::ToggleSettings()
{
	if (HasUiFlag(EUiFlag::Settings))
	{
		CloseSettings();
	}
	else
	{
		OpenSettings();
	}
}

void AchuckCorePlayerController::ResetSettingsToDefaults()
{
	if (UchuckSettings* Settings = UchuckSettings::Get(this))
	{
		Settings->ResetGraphicsToDefaults(true);
	}
	// Rebuild so combo/slider rows reflect the restored defaults.
	const bool bWasOpen = HasUiFlag(EUiFlag::Settings);
	CloseSettings();
	if (bWasOpen)
	{
		OpenSettings();
	}
}

void AchuckCorePlayerController::PauseGame()
{
	if (HasUiFlag(EUiFlag::Pause))
	{
		return;
	}
	SetUiFlag(EUiFlag::Pause, true);

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport)
	{
		return;
	}

	PauseWidget = SNew(SchuckPauseMenu)
		.OnResumeClicked    (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::ResumeGame))
		.OnSettingsClicked  (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::OpenSettings))
		.OnQuitToMenuClicked(FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::QuitToMainMenu))
		.OnQuitClicked      (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::QuitGame));

	Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), PauseWidget.ToSharedRef(), 20);

	FInputModeUIOnly Mode;
	Mode.SetWidgetToFocus(PauseWidget);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	bShowMouseCursor = true;

	SetPause(true);
}

void AchuckCorePlayerController::ResumeGame()
{
	if (!HasUiFlag(EUiFlag::Pause))
	{
		return;
	}
	SetUiFlag(EUiFlag::Pause, false);

	if (PauseWidget.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), PauseWidget.ToSharedRef());
		}
		PauseWidget.Reset();
	}

	SetPause(false);
	SetInputMode(FInputModeGameOnly());
	bShowMouseCursor = false;
}

void AchuckCorePlayerController::OpenSettings()
{
	if (SettingsWidget.IsValid())
	{
		return;
	}
	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport)
	{
		return;
	}

	UchuckSettings* Settings = UchuckSettings::Get(this);
	if (!Settings)
	{
		return;
	}
	const FchuckGraphicsSettings G = Settings->GetGraphics();

	// Toggle row bound to one bool field. Captures `Settings` (subsystem outlives
	// the window) by value so the stored delegate stays valid after OpenSettings returns.
	auto MakeToggle = [Settings](FText Label, bool bInitial, TFunction<void(FchuckGraphicsSettings&, bool)> Set)
	{
		return SNew(SKBVESettingsToggleRow)
			.Label(Label)
			.IsChecked(bInitial)
			.OnToggled_Lambda([Settings, Set](bool bOn)
			{
				FchuckGraphicsSettings W = Settings->GetGraphics();
				Set(W, bOn);
				Settings->SetGraphics(W);
			});
	};

	const int32 MsaaIndex = G.MSAASamples >= 8 ? 3 : (G.MSAASamples >= 4 ? 2 : (G.MSAASamples >= 2 ? 1 : 0));
	const TArray<int32> MsaaByIndex = { 0, 2, 4, 8 };

	const TArray<int32> FpsByIndex = { 0, 30, 60, 120, 144, 240 };
	int32 FpsIndex = 0;
	for (int32 i = 0; i < FpsByIndex.Num(); ++i) { if (FpsByIndex[i] == G.FpsCap) { FpsIndex = i; break; } }

	SettingsWidget = SNew(SKBVESettingsFrame)
		.Title(NSLOCTEXT("chuck", "SettingsTitle", "Settings"))
		.bShowReset(true)
		.OnCloseClicked (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::CloseSettings))
		.OnCancelClicked(FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::CloseSettings))
		.OnResetClicked (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::ResetSettingsToDefaults))
		.OnApplyClicked (FSimpleDelegate::CreateLambda([Settings]() { Settings->ApplyGraphics(); }))
		.Rows()
		[
			SNew(SVerticalBox)

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[ MakeToggle(NSLOCTEXT("chuck", "Lumen", "Lumen Global Illumination"), G.bLumenGI,
				[](FchuckGraphicsSettings& W, bool b) { W.bLumenGI = b; }) ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[ MakeToggle(NSLOCTEXT("chuck", "LumenRefl", "Lumen Reflections"), G.bLumenReflections,
				[](FchuckGraphicsSettings& W, bool b) { W.bLumenReflections = b; }) ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[ MakeToggle(NSLOCTEXT("chuck", "VSM", "Virtual Shadow Maps"), G.bVirtualShadowMaps,
				[](FchuckGraphicsSettings& W, bool b) { W.bVirtualShadowMaps = b; }) ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[ MakeToggle(NSLOCTEXT("chuck", "RayTracing", "Ray Tracing (restart)"), G.bRayTracing,
				[](FchuckGraphicsSettings& W, bool b) { W.bRayTracing = b; }) ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[ MakeToggle(NSLOCTEXT("chuck", "MotionBlur", "Motion Blur"), G.bMotionBlur,
				[](FchuckGraphicsSettings& W, bool b) { W.bMotionBlur = b; }) ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[ MakeToggle(NSLOCTEXT("chuck", "Bloom", "Bloom"), G.bBloom,
				[](FchuckGraphicsSettings& W, bool b) { W.bBloom = b; }) ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[
				SNew(SKBVESettingsComboRow)
				.Label(NSLOCTEXT("chuck", "AntiAliasing", "Anti-Aliasing"))
				.Options(TArray<FString>{ TEXT("None"), TEXT("FXAA"), TEXT("TAA"), TEXT("TSR") })
				.InitialSelection(FMath::Clamp(G.AntiAliasing, 0, 3))
				.OnSelectionChanged_Lambda([Settings](FString, int32 Index)
				{
					FchuckGraphicsSettings W = Settings->GetGraphics();
					W.AntiAliasing = Index;
					Settings->SetGraphics(W);
				})
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[
				SNew(SKBVESettingsComboRow)
				.Label(NSLOCTEXT("chuck", "MSAA", "MSAA (forward)"))
				.Options(TArray<FString>{ TEXT("Off"), TEXT("2x"), TEXT("4x"), TEXT("8x") })
				.InitialSelection(MsaaIndex)
				.OnSelectionChanged_Lambda([Settings, MsaaByIndex](FString, int32 Index)
				{
					const int32 Samples = MsaaByIndex.IsValidIndex(Index) ? MsaaByIndex[Index] : 0;
					FchuckGraphicsSettings W = Settings->GetGraphics();
					W.MSAASamples = Samples;
					Settings->SetGraphics(W);
				})
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[
				SNew(SKBVESettingsComboRow)
				.Label(NSLOCTEXT("chuck", "FpsCap", "FPS Limit"))
				.Options(TArray<FString>{ TEXT("Uncapped"), TEXT("30"), TEXT("60"), TEXT("120"), TEXT("144"), TEXT("240") })
				.InitialSelection(FpsIndex)
				.OnSelectionChanged_Lambda([Settings, FpsByIndex](FString, int32 Index)
				{
					const int32 Cap = FpsByIndex.IsValidIndex(Index) ? FpsByIndex[Index] : 0;
					FchuckGraphicsSettings W = Settings->GetGraphics();
					W.FpsCap = Cap;
					Settings->SetGraphics(W);
				})
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[ MakeToggle(NSLOCTEXT("chuck", "VSync", "V-Sync"), G.bVSync,
				[](FchuckGraphicsSettings& W, bool b) { W.bVSync = b; }) ]

			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SKBVESettingsSliderRow)
				.Label(NSLOCTEXT("chuck", "ResScale", "Resolution Scale"))
				.MinValue(50.f)
				.MaxValue(100.f)
				.StepSize(5.f)
				.Value(G.ResolutionScale)
				.OnValueChanged_Lambda([Settings](float Pct)
				{
					FchuckGraphicsSettings W = Settings->GetGraphics();
					W.ResolutionScale = Pct;
					Settings->SetGraphics(W);
				})
			]
		];

	Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), SettingsWidget.ToSharedRef(), 22);
	SetUiFlag(EUiFlag::Settings, true);

	FInputModeUIOnly Mode;
	Mode.SetWidgetToFocus(SettingsWidget);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	bShowMouseCursor = true;
}

void AchuckCorePlayerController::CloseSettings()
{
	if (SettingsWidget.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), SettingsWidget.ToSharedRef());
		}
		SettingsWidget.Reset();
	}
	SetUiFlag(EUiFlag::Settings, false);

	if (HasUiFlag(EUiFlag::Pause) && PauseWidget.IsValid())
	{
		FInputModeUIOnly Mode;
		Mode.SetWidgetToFocus(PauseWidget);
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		SetInputMode(Mode);
		bShowMouseCursor = true;
	}
	else
	{
		RefreshUiMouseMode();
	}
}

void AchuckCorePlayerController::QuitToMainMenu()
{
	SetPause(false);
	UGameplayStatics::OpenLevel(this, MainMenuLevelName);
}

void AchuckCorePlayerController::QuitGame()
{
	UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
}

void AchuckCorePlayerController::OnToggleDevOverlayPressed(const FInputActionValue& Value)
{
	SetUiFlag(EUiFlag::DevOverlay, !HasUiFlag(EUiFlag::DevOverlay));

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport)
	{
		return;
	}

	if (HasUiFlag(EUiFlag::DevOverlay))
	{
		DevOverlayWidget = SNew(SKBVEDevOverlay)
			.EntityCountProvider(FKBVEDevOverlayIntProvider::CreateLambda([this]() -> int32
			{
				if (UWorld* W = GetWorld())
				{
					if (UMassEntitySubsystem* Mass = W->GetSubsystem<UMassEntitySubsystem>())
					{
#if !UE_BUILD_SHIPPING
						return (int32)Mass->GetEntityManager().DebugGetEntityCount();
#endif
					}
				}
				return 0;
			}))
			.PingProvider(FKBVEDevOverlayIntProvider::CreateLambda([this]() -> int32
			{
				return PlayerState ? (int32)PlayerState->GetPingInMilliseconds() : 0;
			}));
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), DevOverlayWidget.ToSharedRef(), 15);
	}
	else if (DevOverlayWidget.IsValid())
	{
		Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), DevOverlayWidget.ToSharedRef());
		DevOverlayWidget.Reset();
	}
}

void AchuckCorePlayerController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (bSpawnSnapPending)
	{
		TickSpawnSnap(DeltaSeconds);
	}

	if (bPendingTooltipDirty && TooltipWidget.IsValid())
	{
		bPendingTooltipDirty = false;
		if (bPendingTooltipShow)
		{
			FKBVETooltipContent C;
			C.Title       = PendingTooltipTitle;
			C.Subtitle    = PendingTooltipSubtitle;
			C.Body        = PendingTooltipBody;
			C.TitleColor  = PendingTooltipTitleColor;
			C.BorderColor = PendingTooltipBorderColor;
			TooltipWidget->ShowRich(C, PendingTooltipPos);
		}
		else
		{
			TooltipWidget->Hide();
		}
	}
}

void AchuckCorePlayerController::OnInventoryPressed(const FInputActionValue& Value)
{
	UE_LOG(LogTemp, Display, TEXT("[chuck] Inventory key pressed (currently %s)"),
		HasUiFlag(EUiFlag::Inventory) ? TEXT("open") : TEXT("closed"));
	if (HasUiFlag(EUiFlag::Inventory)) CloseInventory();
	else                OpenInventory();
}

void AchuckCorePlayerController::OpenInventory()
{
	if (HasUiFlag(EUiFlag::Inventory)) return;
	AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(GetPawn());
	if (!Char) return;

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport) return;

	InventoryWidget = SNew(SchuckInventoryWindow)
		.OwningCharacter(Char)
		.OnCloseClicked(FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::CloseInventory));
	Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), InventoryWidget.ToSharedRef(), 12);

	SetUiFlag(EUiFlag::Inventory, true);
	RefreshUiMouseMode();
	if (InventoryWidget.IsValid())
	{
		FSlateApplication::Get().SetKeyboardFocus(InventoryWidget, EFocusCause::SetDirectly);
	}

	if (HotbarWidget.IsValid())
	{
		HotbarWidget->SetExpanded(true);
	}
}

void AchuckCorePlayerController::CloseInventory()
{
	if (!HasUiFlag(EUiFlag::Inventory)) return;

	if (InventoryWidget.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), InventoryWidget.ToSharedRef());
		}
		InventoryWidget.Reset();
	}

	SetUiFlag(EUiFlag::Inventory, false);
	RefreshUiMouseMode();

	if (HotbarWidget.IsValid())
	{
		HotbarWidget->SetExpanded(false);
	}
}

void AchuckCorePlayerController::InitSupabaseBridge()
{
	UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get();
	if (!Sub) return;

	Sub->OnSignedIn.AddUniqueDynamic(this, &AchuckCorePlayerController::HandleSupabaseSignedIn);
	Sub->OnSignedOut.AddUniqueDynamic(this, &AchuckCorePlayerController::HandleSupabaseSignedOut);
	Sub->OnAuthError.AddUniqueDynamic(this, &AchuckCorePlayerController::HandleSupabaseAuthError);

	if (UKBVESupabaseChat* Chat = Sub->GetChat())
	{
		Chat->OnConnected.AddUniqueDynamic(this, &AchuckCorePlayerController::HandleChatConnected);
		Chat->OnDisconnected.AddUniqueDynamic(this, &AchuckCorePlayerController::HandleChatDisconnected);
		Chat->OnMessage.AddUniqueDynamic(this, &AchuckCorePlayerController::HandleChatMessage);
		Chat->OnChannelJoined.AddUniqueDynamic(this, &AchuckCorePlayerController::HandleChatChannelJoined);
		Chat->OnChannelLeft.AddUniqueDynamic(this, &AchuckCorePlayerController::HandleChatChannelLeft);
	}

	const bool bSignedIn = Sub->IsSignedIn();
	UE_LOG(LogTemp, Display, TEXT("[chuck] CorePC InitSupabaseBridge bSignedIn=%d sessionValid=%d status=%d"),
		bSignedIn ? 1 : 0,
		Sub->GetSession().IsValid() ? 1 : 0,
		(int32)Sub->GetStatus());
	RefreshAuthOverlayVisibility(bSignedIn);
	if (bSignedIn)
	{
		const FKBVESupabaseUser& U = Sub->GetUser();
		if (AccountWidget.IsValid())
		{
			AccountWidget->SetUsername(U.KbveUsername.IsEmpty() ? U.Id : U.KbveUsername);
			AccountWidget->SetEmail(U.Email);
		}
		if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
		{
			FchuckAuthStatusPayload Payload;
			Payload.bSignedIn    = true;
			Payload.UserId       = U.Id;
			Payload.Email        = U.Email;
			Payload.KbveUsername = U.KbveUsername;
			Bus->AuthStatus.Publish(Payload);
		}
		if (UKBVESupabaseChat* Chat = Sub->GetChat())
		{
			Chat->Connect();
		}
	}
}

void AchuckCorePlayerController::TearDownSupabaseBridge()
{
	UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get();
	if (!Sub) return;

	Sub->OnSignedIn.RemoveDynamic(this, &AchuckCorePlayerController::HandleSupabaseSignedIn);
	Sub->OnSignedOut.RemoveDynamic(this, &AchuckCorePlayerController::HandleSupabaseSignedOut);
	Sub->OnAuthError.RemoveDynamic(this, &AchuckCorePlayerController::HandleSupabaseAuthError);

	if (UKBVESupabaseChat* Chat = Sub->GetChat())
	{
		Chat->OnConnected.RemoveDynamic(this, &AchuckCorePlayerController::HandleChatConnected);
		Chat->OnDisconnected.RemoveDynamic(this, &AchuckCorePlayerController::HandleChatDisconnected);
		Chat->OnMessage.RemoveDynamic(this, &AchuckCorePlayerController::HandleChatMessage);
		Chat->OnChannelJoined.RemoveDynamic(this, &AchuckCorePlayerController::HandleChatChannelJoined);
		Chat->OnChannelLeft.RemoveDynamic(this, &AchuckCorePlayerController::HandleChatChannelLeft);
	}
}

void AchuckCorePlayerController::HandleChatChannelJoined(const FString& Channel)
{
	if (ChatWidget.IsValid())
	{
		ChatWidget->OnChannelJoined(Channel);
	}
}

void AchuckCorePlayerController::HandleChatChannelLeft(const FString& Channel)
{
	if (ChatWidget.IsValid())
	{
		ChatWidget->OnChannelLeft(Channel);
	}
}

void AchuckCorePlayerController::OnToggleChatPressed(const FInputActionValue& /*Value*/)
{
	if (!ChatWidget.IsValid()) return;
	if (ChatWidget->IsDocked())
	{
		ChatWidget->Undock();
		SetUiFlag(EUiFlag::Chat, true);
	}
	else
	{
		ChatWidget->Dock();
		SetUiFlag(EUiFlag::Chat, false);
	}
	RefreshUiMouseMode();
}

void AchuckCorePlayerController::OnFocusChatPressed(const FInputActionValue& /*Value*/)
{
	if (!ChatWidget.IsValid()) return;
	ChatWidget->Undock();
	SetUiFlag(EUiFlag::Chat, true);
	RefreshUiMouseMode();
}

void AchuckCorePlayerController::OnInteractPressed(const FInputActionValue& /*Value*/)
{
	if (!AchuckArcadeCabinet::ActivateNearby())
	{
		UE_LOG(LogTemp, Verbose, TEXT("[chuck] Interact pressed — no nearby interactable"));
	}
}

static FAutoConsoleCommand GchuckSpawnArcadeCmd(
	TEXT("chuck.SpawnArcade"),
	TEXT("Spawn an arcade cabinet 4m in front of the local player."),
	FConsoleCommandWithWorldDelegate::CreateLambda([](UWorld* World)
	{
		if (!World) return;
		APlayerController* PC = World->GetFirstPlayerController();
		APawn* Pawn = PC ? PC->GetPawn() : nullptr;
		if (!Pawn)
		{
			UE_LOG(LogTemp, Warning, TEXT("[chuck] SpawnArcade: no pawn"));
			return;
		}
		const FVector Forward = Pawn->GetActorForwardVector();
		const FVector Loc     = Pawn->GetActorLocation() + Forward * 400.f + FVector(0.f, 0.f, -90.f);
		const FRotator Rot(0.f, Pawn->GetActorRotation().Yaw + 180.f, 0.f);

		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AchuckArcadeCabinet* Arcade = World->SpawnActor<AchuckArcadeCabinet>(
			AchuckArcadeCabinet::StaticClass(), Loc, Rot, Params);
		UE_LOG(LogTemp, Display, TEXT("[chuck] SpawnArcade → %s at (%.0f,%.0f,%.0f)"),
			Arcade ? *Arcade->GetName() : TEXT("(null)"), Loc.X, Loc.Y, Loc.Z);
	})
);

bool AchuckCorePlayerController::IsAnyUiPanelOpen() const
{
	return HasAnyUiFlags(NeedsCursorMask);
}

void AchuckCorePlayerController::SetUiFlag(EUiFlag F, bool bOn)
{
	const uint32 Bit = static_cast<uint32>(F);
	const uint32 Old = UiFlags;
	if (bOn) UiFlags |= Bit;
	else     UiFlags &= ~Bit;
	if (UiFlags != Old)
	{
		BroadcastUiFlagsChanged(Old);
		ApplyUiFlagsVisibility();
	}
}

void AchuckCorePlayerController::BroadcastUiFlagsChanged(uint32 OldFlags)
{
	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FchuckUiFlagsPayload Payload;
		Payload.NewFlags = UiFlags;
		Payload.OldFlags = OldFlags;
		Payload.Diff     = UiFlags ^ OldFlags;
		Bus->UiFlags.Publish(Payload);
	}
}

void AchuckCorePlayerController::ApplyUiFlagsVisibility()
{
	auto Apply = [](TSharedPtr<SWidget> W, bool bOn, EVisibility OnVis)
	{
		if (W.IsValid())
		{
			W->SetVisibility(bOn ? OnVis : EVisibility::Collapsed);
		}
	};

	Apply(InventoryWidget, HasUiFlag(EUiFlag::Inventory), EVisibility::Visible);
	Apply(PauseWidget,     HasUiFlag(EUiFlag::Pause),     EVisibility::Visible);
	Apply(SettingsWidget,  HasUiFlag(EUiFlag::Settings),  EVisibility::Visible);
	Apply(DevOverlayWidget,HasUiFlag(EUiFlag::DevOverlay),EVisibility::SelfHitTestInvisible);
	Apply(ChatWidget,      HasUiFlag(EUiFlag::Chat),      EVisibility::SelfHitTestInvisible);
	Apply(AccountWidget,   HasUiFlag(EUiFlag::Account),   EVisibility::SelfHitTestInvisible);
}

void AchuckCorePlayerController::RefreshUiMouseMode()
{
	const bool bUi = IsAnyUiPanelOpen();
	bShowMouseCursor = bUi;
	if (bUi)
	{
		FInputModeGameAndUI Mode;
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		Mode.SetHideCursorDuringCapture(false);
		SetInputMode(Mode);
	}
	else
	{
		SetInputMode(FInputModeGameOnly());
		ResetIgnoreInputFlags();
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->SetMouseCaptureMode(EMouseCaptureMode::CapturePermanently_IncludingInitialMouseDown);
			Viewport->SetMouseLockMode(EMouseLockMode::LockOnCapture);
			FSlateApplication::Get().SetAllUserFocusToGameViewport();
		}
	}
}

void AchuckCorePlayerController::RefreshAuthOverlayVisibility(bool bSignedIn)
{
	SetUiFlag(EUiFlag::Account, bSignedIn);
	if (!bSignedIn)
	{
		SetUiFlag(EUiFlag::Chat, false);
	}
}

void AchuckCorePlayerController::HandleSupabaseSignedIn(const FKBVESupabaseSession& Session)
{
	const FKBVESupabaseUser& U = Session.User;

	if (AccountWidget.IsValid())
	{
		AccountWidget->SetUsername(U.KbveUsername.IsEmpty() ? U.Id : U.KbveUsername);
		AccountWidget->SetEmail(U.Email);
	}
	RefreshAuthOverlayVisibility(/*bSignedIn=*/true);

	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FchuckAuthStatusPayload Payload;
		Payload.bSignedIn    = true;
		Payload.UserId       = U.Id;
		Payload.Email        = U.Email;
		Payload.KbveUsername = U.KbveUsername;
		Bus->AuthStatus.Publish(Payload);
	}

	if (UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get())
	{
		if (UKBVESupabaseChat* Chat = Sub->GetChat())
		{
			Chat->Connect();
		}
	}
}

void AchuckCorePlayerController::HandleSupabaseSignedOut()
{
	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FchuckAuthStatusPayload Payload;
		Payload.bSignedIn = false;
		Bus->AuthStatus.Publish(Payload);
	}
	RefreshAuthOverlayVisibility(/*bSignedIn=*/false);

	if (!MainMenuLevelName.IsNone())
	{
		UE_LOG(LogTemp, Display, TEXT("[chuck] CorePC signed out — returning to %s"), *MainMenuLevelName.ToString());
		bShowMouseCursor = true;
		SetInputMode(FInputModeUIOnly());
		UGameplayStatics::OpenLevel(this, MainMenuLevelName);
	}
}

void AchuckCorePlayerController::HandleSupabaseAuthError(const FKBVESupabaseError& Error)
{
	UE_LOG(LogTemp, Warning, TEXT("[chuck] CorePC auth error: %s"), *Error.Message);
	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FchuckAuthErrorPayload Payload;
		Payload.HttpStatus = Error.HttpStatus;
		Payload.Code       = Error.Code;
		Payload.Message    = Error.Message;
		Bus->AuthError.Publish(Payload);
	}
}

void AchuckCorePlayerController::HandleChatConnected()
{
	if (ChatWidget.IsValid())
	{
		ChatWidget->OnChatStateChanged(true);
	}
	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FchuckChatStatePayload Payload;
		Payload.bConnected = true;
		Bus->ChatState.Publish(Payload);
	}
}

void AchuckCorePlayerController::HandleChatDisconnected(int32 /*StatusCode*/, const FString& /*Reason*/)
{
	if (ChatWidget.IsValid())
	{
		ChatWidget->OnChatStateChanged(false);
	}
	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FchuckChatStatePayload Payload;
		Payload.bConnected = false;
		Bus->ChatState.Publish(Payload);
	}
}

void AchuckCorePlayerController::HandleChatMessage(const FKBVEChatMessage& Message)
{
	FchuckChatLinePayload Payload;
	Payload.Channel  = Message.Channel;
	Payload.Nick     = Message.Nick;
	Payload.Sender   = Message.Sender;
	Payload.Platform = Message.Platform;
	Payload.Kind     = Message.Kind;
	Payload.Body     = Message.Body;
	Payload.bIsEvent = Message.bIsEvent;

	if (ChatWidget.IsValid())
	{
		FKBVEChatLineView View;
		View.Channel  = Message.Channel;
		View.Nick     = Message.Nick;
		View.Sender   = Message.Sender;
		View.Platform = Message.Platform;
		View.Kind     = Message.Kind;
		View.Body     = Message.Body;
		View.bIsEvent = Message.bIsEvent;
		ChatWidget->OnChatLine(View);
	}
	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		Bus->ChatLine.Publish(Payload);
	}
}

void AchuckCorePlayerController::TickSpawnSnap(float DeltaSeconds)
{
	SpawnSnapElapsed += DeltaSeconds;

	APawn* ControlledPawn = GetPawn();
	if (!ControlledPawn) return;

	UWorld* W = GetWorld();
	if (!W) return;

	const FVector PawnLoc = ControlledPawn->GetActorLocation();
	const FVector Start(SpawnSnapAnchor.X, SpawnSnapAnchor.Y, PawnLoc.Z + 100.f);
	const FVector End  (SpawnSnapAnchor.X, SpawnSnapAnchor.Y, -10000.f);

	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(chuckSpawnSnap), false, ControlledPawn);
	const bool bHit = W->LineTraceSingleByChannel(Hit, Start, End, ECC_WorldStatic, Params);

	if (bHit && Hit.GetActor() && Hit.GetActor() != ControlledPawn)
	{
		float CapsuleHalf = 90.f;
		if (ACharacter* Char = Cast<ACharacter>(ControlledPawn))
		{
			if (UCapsuleComponent* Cap = Char->GetCapsuleComponent())
			{
				CapsuleHalf = Cap->GetScaledCapsuleHalfHeight();
			}
		}

		const FVector Snap(SpawnSnapAnchor.X, SpawnSnapAnchor.Y, Hit.ImpactPoint.Z + CapsuleHalf + 4.f);
		ControlledPawn->TeleportTo(Snap, ControlledPawn->GetActorRotation(), false, true);

		if (ACharacter* Char = Cast<ACharacter>(ControlledPawn))
		{
			if (UCharacterMovementComponent* CM = Char->GetCharacterMovement())
			{
				CM->StopMovementImmediately();
				CM->Velocity = FVector::ZeroVector;
				CM->GravityScale = 1.f;
			}
		}

		UE_LOG(LogTemp, Display,
			TEXT("[chuck] CorePC spawn-snap hit z=%.1f actor=%s snapTo=(%.0f,%.0f,%.0f) elapsed=%.2fs"),
			Hit.ImpactPoint.Z, *Hit.GetActor()->GetName(), Snap.X, Snap.Y, Snap.Z, SpawnSnapElapsed);

		if (!bDidAutoSpawnArcade)
		{
			bDidAutoSpawnArcade = true;

			const FVector ArcadePawnLoc = ControlledPawn->GetActorLocation();
			const FVector PawnFwd       = ControlledPawn->GetActorForwardVector();
			const FVector ArcadeXY      = ArcadePawnLoc + PawnFwd * 400.f;

			float ArcadeZ = ArcadePawnLoc.Z - 90.f;
			FHitResult ArcadeHit;
			FCollisionQueryParams ArcadeParams(SCENE_QUERY_STAT(chuckArcadeSnap), false, ControlledPawn);
			if (W->LineTraceSingleByChannel(ArcadeHit,
					FVector(ArcadeXY.X, ArcadeXY.Y, ArcadePawnLoc.Z + 500.f),
					FVector(ArcadeXY.X, ArcadeXY.Y, ArcadePawnLoc.Z - 10000.f),
					ECC_WorldStatic, ArcadeParams)
				&& ArcadeHit.GetActor() && ArcadeHit.GetActor() != ControlledPawn)
			{
				ArcadeZ = ArcadeHit.ImpactPoint.Z;
			}

			const FVector ArcadeLoc(ArcadeXY.X, ArcadeXY.Y, ArcadeZ);
			const FRotator ArcadeRot(0.f, ControlledPawn->GetActorRotation().Yaw + 180.f, 0.f);

			UClass* ArcadeClass = CachedArcadeClass ? CachedArcadeClass.Get() : AchuckArcadeCabinet::StaticClass();

			FActorSpawnParameters SpawnParams;
			SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			SpawnParams.Owner = this;
			AchuckArcadeCabinet* Arcade = GetWorld()->SpawnActor<AchuckArcadeCabinet>(
				ArcadeClass, ArcadeLoc, ArcadeRot, SpawnParams);
			UE_LOG(LogTemp, Display,
				TEXT("[chuck] Auto-spawned arcade %s class=%s at (%.0f,%.0f,%.0f) yaw=%.0f"),
				Arcade ? *Arcade->GetName() : TEXT("(null)"),
				*ArcadeClass->GetName(),
				ArcadeLoc.X, ArcadeLoc.Y, ArcadeLoc.Z, ArcadeRot.Yaw);
		}

		if (!bDidAutoSpawnSlimes)
		{
			bDidAutoSpawnSlimes = true;
			if (UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(GetWorld()))
			{
				Nav->RegisterInvoker(*ControlledPawn, 6000.f, 8000.f, FNavAgentSelector(), ENavigationInvokerPriority::Default);
				UE_LOG(LogTemp, Warning, TEXT("[SlimeNav] registered invoker on pawn %s"), *ControlledPawn->GetName());
			}
			if (UchuckNpcSpawner* NpcSpawner = GetWorld()->GetSubsystem<UchuckNpcSpawner>())
			{
				NpcSpawner->SpawnCreature(FName(TEXT("glass-slime")), ControlledPawn->GetActorLocation(), 10000, 18000.f);
			}
		}

		bSpawnSnapPending = false;
		return;
	}

}
