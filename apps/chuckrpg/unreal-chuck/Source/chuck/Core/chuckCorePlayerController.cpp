#include "chuckCorePlayerController.h"

#include "chuckCoreCharacter.h"
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
#include "SchuckDevOverlay.h"
#include "SchuckHotbar.h"
#include "SchuckHUD.h"
#include "SchuckInventoryWindow.h"
#include "SchuckLoginWidget.h"
#include "SchuckAccountPanel.h"
#include "SchuckChatPanel.h"
#include "SchuckPauseMenu.h"
#include "chuckInventory.h"
#include "chuckItemDB.h"
#include "chuckItemTypes.h"
#include "Engine/GameInstance.h"
#include "SKBVEDragArrowLayer.h"
#include "SKBVETooltip.h"
#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseChat.h"
#include "KBVESupabaseTypes.h"

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

	HUDWidget    = SNew(SchuckHUD).OwningCharacter(Char);
	HotbarWidget = SNew(SchuckHotbar).OwningCharacter(Char);
	TooltipWidget = SNew(SKBVETooltip);
	DragArrowLayer = SNew(SKBVEDragArrowLayer);

	if (UGameInstance* GI = GetGameInstance())
	{
		SupabaseSubsystem = GI->GetSubsystem<UKBVESupabaseSubsystem>();
	}

	LoginWidget   = SNew(SchuckLoginWidget).Subsystem(SupabaseSubsystem);
	AccountWidget = SNew(SchuckAccountPanel).Subsystem(SupabaseSubsystem);
	ChatWidget    = SNew(SchuckChatPanel)
		.Subsystem(SupabaseSubsystem)
		.OwningCharacter(Char);

	if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
	{
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), HUDWidget.ToSharedRef(),       5);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), HotbarWidget.ToSharedRef(),    20);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), DragArrowLayer.ToSharedRef(), 29);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), TooltipWidget.ToSharedRef(),  30);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), ChatWidget.ToSharedRef(),     35);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), AccountWidget.ToSharedRef(),  40);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), LoginWidget.ToSharedRef(),    45);
	}

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

	if (LoginWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), LoginWidget.ToSharedRef());
		LoginWidget.Reset();
	}
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
		bInventoryOpen = false;
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
	Super::OnUnPossess();
}

void AchuckCorePlayerController::OnPausePressed(const FInputActionValue& Value)
{
	if (bGamePaused)
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
	if (bGamePaused)
	{
		return;
	}
	bGamePaused = true;

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport)
	{
		return;
	}

	PauseWidget = SNew(SchuckPauseMenu)
		.OnResumeClicked    (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::ResumeGame))
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
	if (!bGamePaused)
	{
		return;
	}
	bGamePaused = false;

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
	bDevOverlayShown = !bDevOverlayShown;

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport)
	{
		return;
	}

	if (bDevOverlayShown)
	{
		DevOverlayWidget = SNew(SchuckDevOverlay).OwningController(this);
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
		bInventoryOpen ? TEXT("open") : TEXT("closed"));
	if (bInventoryOpen) CloseInventory();
	else                OpenInventory();
}

void AchuckCorePlayerController::OpenInventory()
{
	if (bInventoryOpen) return;
	AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(GetPawn());
	if (!Char) return;

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport) return;

	InventoryWidget = SNew(SchuckInventoryWindow)
		.OwningCharacter(Char)
		.OnCloseClicked(FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::CloseInventory));
	Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), InventoryWidget.ToSharedRef(), 12);

	FInputModeGameAndUI Mode;
	Mode.SetWidgetToFocus(InventoryWidget);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	bShowMouseCursor = true;
	bInventoryOpen   = true;

	if (HotbarWidget.IsValid())
	{
		HotbarWidget->SetExpanded(true);
	}
}

void AchuckCorePlayerController::CloseInventory()
{
	if (!bInventoryOpen) return;

	if (InventoryWidget.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), InventoryWidget.ToSharedRef());
		}
		InventoryWidget.Reset();
	}

	SetInputMode(FInputModeGameOnly());
	bShowMouseCursor = false;
	bInventoryOpen   = false;

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
	RefreshAuthOverlayVisibility(bSignedIn);
	if (bSignedIn)
	{
		const FKBVESupabaseUser& U = Sub->GetUser();
		if (AccountWidget.IsValid())
		{
			AccountWidget->SetUsername(U.KbveUsername.IsEmpty() ? U.Id : U.KbveUsername);
			AccountWidget->SetEmail(U.Email);
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
	if (ChatWidget.IsValid())
	{
		ChatWidget->ToggleVisible();
	}
}

void AchuckCorePlayerController::OnFocusChatPressed(const FInputActionValue& /*Value*/)
{
	if (ChatWidget.IsValid())
	{
		ChatWidget->ShowAndFocusInput();
	}
}

void AchuckCorePlayerController::RefreshAuthOverlayVisibility(bool bSignedIn)
{
	if (LoginWidget.IsValid())
	{
		LoginWidget->SetVisibility(bSignedIn ? EVisibility::Collapsed : EVisibility::Visible);
	}
	if (AccountWidget.IsValid())
	{
		AccountWidget->SetVisibility(bSignedIn ? EVisibility::Visible : EVisibility::Collapsed);
	}
	if (ChatWidget.IsValid())
	{
		ChatWidget->SetVisibility(bSignedIn ? EVisibility::Visible : EVisibility::Collapsed);
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
	RefreshAuthOverlayVisibility(/*bSignedIn=*/false);
	if (LoginWidget.IsValid())
	{
		LoginWidget->SetStatusText(FText::FromString(TEXT("Signed out.")), FLinearColor(0.85f, 0.85f, 0.85f));
	}
	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FchuckAuthStatusPayload Payload;
		Payload.bSignedIn = false;
		Bus->AuthStatus.Publish(Payload);
	}
}

void AchuckCorePlayerController::HandleSupabaseAuthError(const FKBVESupabaseError& Error)
{
	if (LoginWidget.IsValid())
	{
		LoginWidget->SetStatusText(FText::FromString(Error.Message), FLinearColor(1.f, 0.4f, 0.3f));
	}
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
		FchuckChatStatePayload Payload;
		Payload.bConnected = true;
		ChatWidget->OnChatStateChanged(Payload);
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
		FchuckChatStatePayload Payload;
		Payload.bConnected = false;
		ChatWidget->OnChatStateChanged(Payload);
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
		ChatWidget->OnChatLine(Payload);
	}
	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		Bus->ChatLine.Publish(Payload);
	}
}
