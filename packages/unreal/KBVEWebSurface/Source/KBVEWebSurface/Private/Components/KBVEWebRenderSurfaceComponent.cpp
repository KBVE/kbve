#include "Components/KBVEWebRenderSurfaceComponent.h"

#include "KBVEWebSurface.h"
#include "Settings/KBVEWebSurfaceSettings.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "WebBrowser.h"
#include "Blueprint/UserWidget.h"

UKBVEWebRenderSurfaceComponent::UKBVEWebRenderSurfaceComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	Resolution = FIntPoint(1024, 768);
	ScreenTextureParam = TEXT("ScreenTexture");
	MaxFrameRate = 30;
}

void UKBVEWebRenderSurfaceComponent::BeginPlay()
{
	Super::BeginPlay();
	EnsureRenderTarget();
	BindMaterial();
	if (!InitialURL.IsEmpty())
	{
		LoadURL(InitialURL);
	}
}

void UKBVEWebRenderSurfaceComponent::EndPlay(const EEndPlayReason::Type Reason)
{
	WebBrowser = nullptr;
	ScreenMID = nullptr;
	RenderTarget = nullptr;
	HostWidget = nullptr;
	Super::EndPlay(Reason);
}

void UKBVEWebRenderSurfaceComponent::LoadURL(const FString& URL)
{
	const UKBVEWebSurfaceSettings* Settings = GetDefault<UKBVEWebSurfaceSettings>();
	if (Settings && !Settings->IsURLAllowed(URL))
	{
		UE_LOG(LogKBVEWebSurface, Warning, TEXT("URL '%s' blocked by allowlist."), *URL);
		return;
	}
	if (WebBrowser)
	{
		WebBrowser->LoadURL(URL);
	}
}

void UKBVEWebRenderSurfaceComponent::EnsureRenderTarget()
{
	if (RenderTarget)
	{
		return;
	}
	RenderTarget = NewObject<UTextureRenderTarget2D>(this);
	RenderTarget->RenderTargetFormat = RTF_RGBA8;
	RenderTarget->InitAutoFormat(Resolution.X, Resolution.Y);
	RenderTarget->UpdateResourceImmediate(true);
}

void UKBVEWebRenderSurfaceComponent::BindMaterial()
{
	if (!RenderTarget)
	{
		return;
	}
	if (GetMaterial(0))
	{
		ScreenMID = CreateAndSetMaterialInstanceDynamic(0);
		if (ScreenMID)
		{
			ScreenMID->SetTextureParameterValue(ScreenTextureParam, RenderTarget);
		}
	}
}
