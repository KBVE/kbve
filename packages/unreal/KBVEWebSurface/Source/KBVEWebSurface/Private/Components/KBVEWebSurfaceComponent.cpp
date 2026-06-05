#include "Components/KBVEWebSurfaceComponent.h"

#include "KBVEWebSurface.h"
#include "Settings/KBVEWebSurfaceSettings.h"
#include "WebBrowser.h"
#include "Blueprint/UserWidget.h"

UKBVEWebSurfaceComponent::UKBVEWebSurfaceComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	MaxFrameRate = 30;
	bPauseWhenOffscreen = true;
	SnapshotDistance = 0.f;
	SetWidgetSpace(EWidgetSpace::World);
	SetDrawSize(FVector2D(1024.f, 768.f));
	SetPivot(FVector2D(0.5f, 0.5f));
}

void UKBVEWebSurfaceComponent::BeginPlay()
{
	Super::BeginPlay();
	if (!InitialURL.IsEmpty())
	{
		LoadURL(InitialURL);
	}
}

void UKBVEWebSurfaceComponent::EndPlay(const EEndPlayReason::Type Reason)
{
	WebBrowser = nullptr;
	Super::EndPlay(Reason);
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
		Browser->LoadURL(URL);
	}
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

UWebBrowser* UKBVEWebSurfaceComponent::ResolveBrowser()
{
	if (WebBrowser)
	{
		return WebBrowser;
	}
	if (UUserWidget* HostWidget = GetUserWidgetObject())
	{
		WebBrowser = Cast<UWebBrowser>(HostWidget->GetWidgetFromName(TEXT("WebBrowser")));
	}
	return WebBrowser;
}
