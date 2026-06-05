#pragma once

#include "CoreMinimal.h"
#include "Components/StaticMeshComponent.h"
#include "KBVEWebRenderSurfaceComponent.generated.h"

class UTextureRenderTarget2D;
class UMaterialInstanceDynamic;
class UWebBrowser;
class UUserWidget;

/** Render-to-texture web surface for curved/holographic/billboard meshes. */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent), DisplayName = "KBVE Web Render Surface")
class KBVEWEBSURFACE_API UKBVEWebRenderSurfaceComponent : public UStaticMeshComponent
{
	GENERATED_BODY()

public:
	UKBVEWebRenderSurfaceComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebRenderSurface")
	FString InitialURL;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebRenderSurface")
	FIntPoint Resolution;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebRenderSurface")
	FName ScreenTextureParam;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebRenderSurface|Perf", meta = (ClampMin = "1", ClampMax = "120"))
	int32 MaxFrameRate;

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebRenderSurface")
	void LoadURL(const FString& URL);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebRenderSurface")
	UTextureRenderTarget2D* GetRenderTarget() const { return RenderTarget; }

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	UPROPERTY(Transient)
	TObjectPtr<UTextureRenderTarget2D> RenderTarget;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInstanceDynamic> ScreenMID;

	UPROPERTY(Transient)
	TObjectPtr<UUserWidget> HostWidget;

	UPROPERTY(Transient)
	TObjectPtr<UWebBrowser> WebBrowser;

	void EnsureRenderTarget();
	void BindMaterial();
};
