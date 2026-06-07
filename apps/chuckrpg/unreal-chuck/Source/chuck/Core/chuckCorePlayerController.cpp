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
#include "SKBVEDevOverlay.h"
#include "GameFramework/PlayerState.h"
#include "MassEntitySubsystem.h"
#include "MassEntityManager.h"
#include "SchuckHotbar.h"
#include "SchuckHUD.h"
#include "SchuckInventoryWindow.h"
#include "SKBVELoginWidget.h"
#include "SKBVEAccountPanel.h"
#include "SKBVEChatPanel.h"
#include "chuckSettings.h"
#include "SchuckPauseMenu.h"
#include "chuckInventory.h"
#include "chuckItemDB.h"
#include "chuckItemTypes.h"
#include "Engine/GameInstance.h"
#include "SKBVEDragArrowLayer.h"
#include "SKBVETooltip.h"
#include "SKBVESettingsFrame.h"
#include "SKBVESettingsToggleRow.h"
#include "SKBVESettingsSliderRow.h"
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
	ChatWidget    = SNew(SKBVEChatPanel)
		.Subsystem(SupabaseSubsystem)
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
					const FchuckItemDef* Def = DB->LookupByKey(S.ItemKey);
					if (!Def) continue;
					DB->GetIconMID(S.ItemKey);
					DB->GetHaloMID(Def->Rarity, chuckItem::RarityColor(Def->Rarity));
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

	UGameUserSettings* GUS = GEngine ? GEngine->GetGameUserSettings() : nullptr;
	const float ResScale = GUS ? GUS->GetResolutionScaleNormalized() * 100.f : 100.f;

	SettingsWidget = SNew(SKBVESettingsFrame)
		.Title(NSLOCTEXT("chuck", "SettingsTitle", "Settings"))
		.bShowReset(false)
		.OnCloseClicked (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::CloseSettings))
		.OnCancelClicked(FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::CloseSettings))
		.OnApplyClicked (FSimpleDelegate::CreateLambda([]()
		{
			if (UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr)
			{
				S->ApplySettings(false);
				S->SaveSettings();
			}
		}))
		.Rows()
		[
			SNew(SVerticalBox)

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0.f, 0.f, 0.f, 8.f)
			[
				SNew(SKBVESettingsToggleRow)
				.Label(NSLOCTEXT("chuck", "VSync", "V-Sync"))
				.IsChecked_Lambda([]()
				{
					UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr;
					return S && S->IsVSyncEnabled();
				})
				.OnToggled_Lambda([](bool bOn)
				{
					if (UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr)
					{
						S->SetVSyncEnabled(bOn);
					}
				})
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			[
				SNew(SKBVESettingsSliderRow)
				.Label(NSLOCTEXT("chuck", "ResScale", "Resolution Scale"))
				.MinValue(50.f)
				.MaxValue(100.f)
				.StepSize(5.f)
				.Value(ResScale)
				.OnValueChanged_Lambda([](float Pct)
				{
					if (UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr)
					{
						S->SetResolutionScaleNormalized(Pct / 100.f);
					}
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
						return (int32)Mass->GetEntityManager().DebugGetEntityCount();
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

	Sub->OnSignedIn.AddDynamic(this, &AchuckCorePlayerController::HandleSupabaseSignedIn);
	Sub->OnSignedOut.AddDynamic(this, &AchuckCorePlayerController::HandleSupabaseSignedOut);
	Sub->OnAuthError.AddDynamic(this, &AchuckCorePlayerController::HandleSupabaseAuthError);

	if (UKBVESupabaseChat* Chat = Sub->GetChat())
	{
		Chat->OnConnected.AddDynamic(this, &AchuckCorePlayerController::HandleChatConnected);
		Chat->OnDisconnected.AddDynamic(this, &AchuckCorePlayerController::HandleChatDisconnected);
		Chat->OnMessage.AddDynamic(this, &AchuckCorePlayerController::HandleChatMessage);
		Chat->OnChannelJoined.AddDynamic(this, &AchuckCorePlayerController::HandleChatChannelJoined);
		Chat->OnChannelLeft.AddDynamic(this, &AchuckCorePlayerController::HandleChatChannelLeft);
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
	const bool bNowShown = ChatWidget->ToggleVisible();
	SetUiFlag(EUiFlag::Chat, bNowShown);
	if (bNowShown) ChatWidget->ShowAndFocusInput();
	RefreshUiMouseMode();
}

void AchuckCorePlayerController::OnFocusChatPressed(const FInputActionValue& /*Value*/)
{
	if (!ChatWidget.IsValid()) return;
	ChatWidget->ShowAndFocusInput();
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

	APawn* Pawn = GetPawn();
	if (!Pawn) return;

	UWorld* W = GetWorld();
	if (!W) return;

	const FVector PawnLoc = Pawn->GetActorLocation();
	const FVector Start(SpawnSnapAnchor.X, SpawnSnapAnchor.Y, PawnLoc.Z + 100.f);
	const FVector End  (SpawnSnapAnchor.X, SpawnSnapAnchor.Y, -10000.f);

	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(chuckSpawnSnap), false, Pawn);
	const bool bHit = W->LineTraceSingleByChannel(Hit, Start, End, ECC_WorldStatic, Params);

	if (bHit && Hit.GetActor() && Hit.GetActor() != Pawn)
	{
		float CapsuleHalf = 90.f;
		if (ACharacter* Char = Cast<ACharacter>(Pawn))
		{
			if (UCapsuleComponent* Cap = Char->GetCapsuleComponent())
			{
				CapsuleHalf = Cap->GetScaledCapsuleHalfHeight();
			}
		}

		const FVector Snap(SpawnSnapAnchor.X, SpawnSnapAnchor.Y, Hit.ImpactPoint.Z + CapsuleHalf + 4.f);
		Pawn->TeleportTo(Snap, Pawn->GetActorRotation(), false, true);

		if (ACharacter* Char = Cast<ACharacter>(Pawn))
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

		static bool bDidAutoSpawnArcade = false;
		if (!bDidAutoSpawnArcade)
		{
			const FVector PawnForward = Pawn->GetActorForwardVector();
			const FVector ArcadeLoc(
				SpawnSnapAnchor.X + PawnForward.X * 400.f,
				SpawnSnapAnchor.Y + PawnForward.Y * 400.f,
				Hit.ImpactPoint.Z + 4.f);
			const FRotator ArcadeRot(0.f, Pawn->GetActorRotation().Yaw + 180.f, 0.f);

			FActorSpawnParameters SpawnParams;
			SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			SpawnParams.Owner = this;
			if (AchuckArcadeCabinet* Arcade = GetWorld()->SpawnActor<AchuckArcadeCabinet>(
				AchuckArcadeCabinet::StaticClass(), ArcadeLoc, ArcadeRot, SpawnParams))
			{
				UE_LOG(LogTemp, Display,
					TEXT("[chuck] Auto-spawned arcade at (%.0f,%.0f,%.0f) yaw=%.0f"),
					ArcadeLoc.X, ArcadeLoc.Y, ArcadeLoc.Z, ArcadeRot.Yaw);
				bDidAutoSpawnArcade = true;
			}
		}

		bSpawnSnapPending = false;
		return;
	}

	if (SpawnSnapElapsed > 8.f)
	{
		if (ACharacter* Char = Cast<ACharacter>(Pawn))
		{
			if (UCharacterMovementComponent* CM = Char->GetCharacterMovement())
			{
				CM->GravityScale = 1.f;
			}
		}
		UE_LOG(LogTemp, Warning,
			TEXT("[chuck] CorePC spawn-snap timeout — no collision under anchor (%.0f,%.0f). Releasing gravity."),
			SpawnSnapAnchor.X, SpawnSnapAnchor.Y);
		bSpawnSnapPending = false;
	}
}
