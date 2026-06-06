#include "chuckMenuPlayerController.h"

#include "SchuckMainMenu.h"
#include "SchuckLoginWidget.h"
#include "SchuckAccountPanel.h"
#include "SchuckLoadingPanel.h"
#include "Engine/GameInstance.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Framework/Application/SlateApplication.h"
#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseTypes.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "chuckTerrainPrewarm.h"
#include "chuckTerrainChunk.h"
#include "KBVEWorldGrassShader.h"
#include "KBVEWorldProceduralGrass.h"

AchuckMenuPlayerController::AchuckMenuPlayerController()
{
	bShowMouseCursor = true;
	bEnableClickEvents = true;
	bEnableMouseOverEvents = true;
	PrimaryActorTick.bCanEverTick = true;
}

void AchuckMenuPlayerController::BeginPlay()
{
	Super::BeginPlay();

	if (UGameInstance* GI = GetGameInstance())
	{
		SupabaseSubsystem = GI->GetSubsystem<UKBVESupabaseSubsystem>();
	}

	MenuWidget = SNew(SchuckMainMenu)
		.OnPlayClicked(FSimpleDelegate::CreateUObject(this, &AchuckMenuPlayerController::HandlePlay))
		.OnQuitClicked(FSimpleDelegate::CreateUObject(this, &AchuckMenuPlayerController::HandleQuit));

	LoginWidget   = SNew(SchuckLoginWidget).Subsystem(SupabaseSubsystem);
	AccountWidget = SNew(SchuckAccountPanel).Subsystem(SupabaseSubsystem);
	LoadingWidget = SNew(SchuckLoadingPanel);
	LoadingWidget->SetVisibility(EVisibility::Collapsed);

	if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
	{
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), MenuWidget.ToSharedRef(),    10);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), AccountWidget.ToSharedRef(), 40);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), LoginWidget.ToSharedRef(),   45);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), LoadingWidget.ToSharedRef(), 60);
	}

	if (UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get())
	{
		Sub->OnSignedIn.AddDynamic(this, &AchuckMenuPlayerController::HandleSupabaseSignedIn);
		Sub->OnSignedOut.AddDynamic(this, &AchuckMenuPlayerController::HandleSupabaseSignedOut);
		Sub->OnSessionRefreshed.AddDynamic(this, &AchuckMenuPlayerController::HandleSupabaseSessionRefreshed);
		const bool bSignedIn = Sub->IsSignedIn();
		if (bSignedIn)
		{
			ApplyAccountFromSession(Sub->GetSession());
			Sub->FetchUser();
		}
		RefreshAuthVisibility(bSignedIn);
	}
	else
	{
		RefreshAuthVisibility(false);
	}

	const uint32 SpawnSeed     = 0xC1A55E5Au;
	const int32 CellsPerEdge   = 32;
	const float CellSize       = 200.f;
	const float ChunkExtent    = CellsPerEdge * CellSize;
	const FIntPoint AnchorChunk(0, 0);
	const int32 PrewarmRadius  = 9;
	FchuckTerrainPrewarm::Get().Kick(SpawnSeed, AnchorChunk, PrewarmRadius, CellsPerEdge, CellSize);

	if (UMaterialInterface* Master = FKBVEWorldGrassShader::GetOrCreateMasterMaterial(this))
	{
		TArray<UStaticMesh*> Throwaway;
		FKBVEWorldProceduralGrass::PopulateProceduralBucket(this, Master, 1, 20.f, 20.f, 50.f, 50.f, Throwaway);
		UE_LOG(LogTemp, Display, TEXT("[chuck] MenuPC grass master+mesh warmed (%d throwaway)"), Throwaway.Num());
	}

	if (UWorld* W = GetWorld())
	{
		FActorSpawnParameters WarmParams;
		WarmParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		WarmParams.ObjectFlags |= RF_Transient;
		if (AchuckTerrainChunk* WarmChunk = W->SpawnActor<AchuckTerrainChunk>(
			AchuckTerrainChunk::StaticClass(),
			FVector(0.f, 0.f, -250000.f),
			FRotator::ZeroRotator, WarmParams))
		{
			WarmChunk->SetActorHiddenInGame(true);
			WarmChunk->Build(FIntPoint(-99999, -99999), SpawnSeed, CellsPerEdge, CellSize, -120.f);
			UE_LOG(LogTemp, Display, TEXT("[chuck] MenuPC PSO warm chunk spawned at Z=-250000 (hidden)"));
		}
	}
	UE_LOG(LogTemp, Display,
		TEXT("[chuck] MenuPC kicked prewarm seed=0x%08x anchor=(%d,%d) radius=%d chunkExtent=%.0fu coverage=%.0fu x %.0fu"),
		SpawnSeed, AnchorChunk.X, AnchorChunk.Y, PrewarmRadius, ChunkExtent,
		(PrewarmRadius * 2 + 1) * ChunkExtent, (PrewarmRadius * 2 + 1) * ChunkExtent);

	FInputModeUIOnly InputMode;
	InputMode.SetWidgetToFocus(MenuWidget);
	InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(InputMode);
}

void AchuckMenuPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get())
	{
		Sub->OnSignedIn.RemoveAll(this);
		Sub->OnSignedOut.RemoveAll(this);
		Sub->OnSessionRefreshed.RemoveAll(this);
	}

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
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
	if (LoadingWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), LoadingWidget.ToSharedRef());
		LoadingWidget.Reset();
	}
	if (MenuWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), MenuWidget.ToSharedRef());
		MenuWidget.Reset();
	}
	Super::EndPlay(EndPlayReason);
}

void AchuckMenuPlayerController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bLoadingActive)
	{
		TickLoadingTransition(DeltaSeconds);
	}
}

void AchuckMenuPlayerController::TickLoadingTransition(float DeltaSeconds)
{
	LoadingElapsed += DeltaSeconds;

	FchuckTerrainPrewarm& Pre = FchuckTerrainPrewarm::Get();
	const int32 Done  = Pre.GetCompletedChunks();
	const int32 Total = FMath::Max(Pre.GetTotalChunks(), 1);
	if (LoadingWidget.IsValid())
	{
		LoadingWidget->SetProgress(Done, Total);
	}

	const bool bPrewarmDone   = Pre.GetTotalChunks() > 0 && Done >= Pre.GetTotalChunks();
	const bool bAnchorOnDisk  = Pre.HasChunk(LoadingSeed, LoadingAnchor);
	const bool bSoftTimeout   = LoadingElapsed > 10.f;

	if ((bPrewarmDone && bAnchorOnDisk) || bSoftTimeout)
	{
		UE_LOG(LogTemp, Display,
			TEXT("[chuck] MenuPC loading->open level=%s done=%d/%d anchorOnDisk=%d elapsed=%.2fs timeout=%d"),
			*PlayLevelName.ToString(), Done, Pre.GetTotalChunks(),
			bAnchorOnDisk ? 1 : 0, LoadingElapsed, bSoftTimeout ? 1 : 0);

		bLoadingActive = false;
		bShowMouseCursor = false;
		SetInputMode(FInputModeGameOnly());
		UGameplayStatics::OpenLevel(this, PlayLevelName);
	}
}

void AchuckMenuPlayerController::HandlePlay()
{
	UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get();
	const bool bHaveSub      = Sub != nullptr;
	const bool bSignedIn     = bHaveSub && Sub->IsSignedIn();
	const bool bSessionValid = bHaveSub && Sub->GetSession().IsValid();

	UE_LOG(LogTemp, Display,
		TEXT("[chuck] MenuPC HandlePlay sub=%d signedIn=%d sessionValid=%d level=%s"),
		bHaveSub ? 1 : 0,
		bSignedIn ? 1 : 0,
		bSessionValid ? 1 : 0,
		*PlayLevelName.ToString());

	if (PlayLevelName.IsNone())
	{
		UE_LOG(LogTemp, Warning, TEXT("[chuck] MenuPC HandlePlay aborted: PlayLevelName is NONE"));
		return;
	}

	LoadingSeed   = 0xC1A55E5Au;
	LoadingAnchor = FIntPoint(0, 0);
	LoadingElapsed = 0.f;
	bLoadingActive = true;

	if (MenuWidget.IsValid())    MenuWidget->SetVisibility(EVisibility::Collapsed);
	if (AccountWidget.IsValid()) AccountWidget->SetVisibility(EVisibility::Collapsed);
	if (LoginWidget.IsValid())   LoginWidget->SetVisibility(EVisibility::Collapsed);
	if (LoadingWidget.IsValid())
	{
		LoadingWidget->SetVisibility(EVisibility::HitTestInvisible);
		LoadingWidget->SetMessage(TEXT("Generating world..."));
		LoadingWidget->SetProgress(
			FchuckTerrainPrewarm::Get().GetCompletedChunks(),
			FMath::Max(FchuckTerrainPrewarm::Get().GetTotalChunks(), 1));
	}

	SetInputMode(FInputModeUIOnly());
}

void AchuckMenuPlayerController::HandleQuit()
{
	UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
}

void AchuckMenuPlayerController::HandleSupabaseSignedIn(const FKBVESupabaseSession& Session)
{
	ApplyAccountFromSession(Session);
	RefreshAuthVisibility(true);
	if (UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get())
	{
		Sub->FetchUser();
	}
	if (MenuWidget.IsValid())
	{
		FInputModeUIOnly Mode;
		Mode.SetWidgetToFocus(MenuWidget);
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		SetInputMode(Mode);
		FSlateApplication::Get().SetKeyboardFocus(MenuWidget, EFocusCause::SetDirectly);
	}
}

void AchuckMenuPlayerController::HandleSupabaseSessionRefreshed(const FKBVESupabaseSession& Session)
{
	ApplyAccountFromSession(Session);
}

void AchuckMenuPlayerController::ApplyAccountFromSession(const FKBVESupabaseSession& Session)
{
	if (!AccountWidget.IsValid()) return;
	const FKBVESupabaseUser& U = Session.User;
	FString DisplayName = U.KbveUsername;
	if (DisplayName.IsEmpty()) DisplayName = U.Email;
	if (DisplayName.IsEmpty()) DisplayName = U.Id;
	AccountWidget->SetUsername(DisplayName);

	FString AvatarURL;
	if (const FString* Found = U.UserMetadata.Find(TEXT("avatar_url")))      AvatarURL = *Found;
	else if (const FString* Pic = U.UserMetadata.Find(TEXT("picture")))      AvatarURL = *Pic;
	else if (const FString* App = U.AppMetadata.Find(TEXT("avatar_url")))    AvatarURL = *App;
	if (!AvatarURL.IsEmpty())
	{
		AccountWidget->SetAvatarURL(AvatarURL);
	}
}

void AchuckMenuPlayerController::HandleSupabaseSignedOut()
{
	RefreshAuthVisibility(false);
}

void AchuckMenuPlayerController::RefreshAuthVisibility(bool bSignedIn)
{
	if (LoginWidget.IsValid())
	{
		LoginWidget->SetVisibility(bSignedIn ? EVisibility::Collapsed : EVisibility::Visible);
	}
	if (AccountWidget.IsValid())
	{
		AccountWidget->SetVisibility(bSignedIn ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed);
	}
}
