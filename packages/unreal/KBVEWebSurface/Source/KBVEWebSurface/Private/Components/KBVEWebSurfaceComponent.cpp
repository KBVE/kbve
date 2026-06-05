#include "Components/KBVEWebSurfaceComponent.h"

#include "KBVEWebSurface.h"
#include "Bridge/KBVEWebBridge.h"
#include "Perf/KBVEWebLODManager.h"
#include "Settings/KBVEWebSurfaceSettings.h"
#include "Widgets/KBVEWebSurfaceUserWidget.h"
#include "WebBrowser.h"
#include "Blueprint/UserWidget.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "Kismet/GameplayStatics.h"

UKBVEWebSurfaceComponent::UKBVEWebSurfaceComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	MaxFrameRate = 30;
	bPauseWhenOffscreen = true;
	SnapshotDistance = 0.f;
	BridgeName = TEXT("kbveBridge");

	SetWidgetSpace(EWidgetSpace::World);
	SetDrawSize(FVector2D(1024.f, 768.f));
	SetPivot(FVector2D(0.5f, 0.5f));
	SetWidgetClass(UKBVEWebSurfaceUserWidget::StaticClass());
}

void UKBVEWebSurfaceComponent::BeginPlay()
{
	Super::BeginPlay();
	if (UWorld* World = GetWorld())
	{
		if (UKBVEWebLODManager* LOD = World->GetSubsystem<UKBVEWebLODManager>())
		{
			LOD->Register(this);
		}
	}
	if (!InitialURL.IsEmpty())
	{
		LoadURL(InitialURL);
	}
}

void UKBVEWebSurfaceComponent::EndPlay(const EEndPlayReason::Type Reason)
{
	if (UWorld* World = GetWorld())
	{
		if (UKBVEWebLODManager* LOD = World->GetSubsystem<UKBVEWebLODManager>())
		{
			LOD->Unregister(this);
		}
	}
	WebBrowser = nullptr;
	Bridge = nullptr;
	Super::EndPlay(Reason);
}

void UKBVEWebSurfaceComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (SnapshotDistance > 0.f)
	{
		const float Dist = DistanceToLocalViewer();
		if (Dist > 0.f && Dist > SnapshotDistance && State != EKBVEWebSurfaceState::Snapshot)
		{
			TransitionTo(EKBVEWebSurfaceState::Snapshot);
		}
		else if (Dist > 0.f && Dist <= SnapshotDistance && State == EKBVEWebSurfaceState::Snapshot)
		{
			TransitionTo(EKBVEWebSurfaceState::Live);
		}
	}

	if (State == EKBVEWebSurfaceState::Snapshot)
	{
		return;
	}

	if (ShouldPauseForOffscreen())
	{
		if (State != EKBVEWebSurfaceState::Paused)
		{
			TransitionTo(EKBVEWebSurfaceState::Paused);
		}
		return;
	}

	if (State == EKBVEWebSurfaceState::Paused || State == EKBVEWebSurfaceState::Inactive)
	{
		TransitionTo(EKBVEWebSurfaceState::Live);
	}

	const float FrameInterval = 1.f / FMath::Max(1, MaxFrameRate);
	RedrawAccumulator += DeltaTime;
	if (RedrawAccumulator >= FrameInterval)
	{
		RedrawAccumulator = 0.f;
		RequestRedraw();
	}
}

void UKBVEWebSurfaceComponent::LoadURL(const FString& URL)
{
	const UKBVEWebSurfaceSettings* Settings = GetDefault<UKBVEWebSurfaceSettings>();
	if (Settings && !Settings->IsURLAllowed(URL))
	{
		UE_LOG(LogKBVEWebSurface, Warning, TEXT("URL '%s' blocked by allowlist."), *URL);
		return;
	}
	if (UWebBrowser* Browser = ResolveBrowser())
	{
		EnsureBridge();
		Browser->LoadURL(URL);
	}
}

void UKBVEWebSurfaceComponent::LoadURLWithFragmentToken(const FString& URL, const FString& Token)
{
	const FString Combined = Token.IsEmpty()
		? URL
		: FString::Printf(TEXT("%s#kbve_token=%s"), *URL, *FGenericPlatformHttp::UrlEncode(Token));
	LoadURL(Combined);
}

void UKBVEWebSurfaceComponent::ExecuteJavaScript(const FString& Script)
{
	if (UWebBrowser* Browser = ResolveBrowser())
	{
		Browser->ExecuteJavascript(Script);
	}
}

void UKBVEWebSurfaceComponent::Reload()
{
	LoadURL(InitialURL);
}

UWebBrowser* UKBVEWebSurfaceComponent::GetWebBrowser()
{
	return ResolveBrowser();
}

UWebBrowser* UKBVEWebSurfaceComponent::ResolveBrowser()
{
	if (WebBrowser)
	{
		return WebBrowser;
	}
	if (UKBVEWebSurfaceUserWidget* HostWidget = Cast<UKBVEWebSurfaceUserWidget>(GetUserWidgetObject()))
	{
		WebBrowser = HostWidget->Browser;
	}
	return WebBrowser;
}

void UKBVEWebSurfaceComponent::EnsureBridge()
{
	if (!Bridge)
	{
		Bridge = NewObject<UKBVEWebBridge>(this);
	}
	if (WebBrowser && Bridge)
	{
		Bridge->BindTo(WebBrowser, BridgeName);
	}
}

void UKBVEWebSurfaceComponent::TransitionTo(EKBVEWebSurfaceState NewState)
{
	if (State == NewState)
	{
		return;
	}
	State = NewState;
	OnStateChanged.Broadcast(NewState);
}

float UKBVEWebSurfaceComponent::DistanceToLocalViewer() const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		return 0.f;
	}
	const APlayerController* PC = UGameplayStatics::GetPlayerController(World, 0);
	if (!PC)
	{
		return 0.f;
	}
	FVector ViewLoc;
	FRotator ViewRot;
	PC->GetPlayerViewPoint(ViewLoc, ViewRot);
	return FVector::Dist(ViewLoc, GetComponentLocation());
}

bool UKBVEWebSurfaceComponent::ShouldPauseForOffscreen() const
{
	if (!bPauseWhenOffscreen)
	{
		return false;
	}
	return !WasRecentlyRendered(0.5f);
}
