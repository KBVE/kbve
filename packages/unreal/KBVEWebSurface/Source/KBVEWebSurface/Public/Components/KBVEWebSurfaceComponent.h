#pragma once

#include "CoreMinimal.h"
#include "Components/WidgetComponent.h"
#include "KBVEWebSurfaceComponent.generated.h"

class UWebBrowser;
class UKBVEWebBridge;

UENUM(BlueprintType)
enum class EKBVEWebSurfaceState : uint8
{
	Inactive,
	Live,
	Paused,
	Snapshot
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKBVEWebSurfaceStateChanged, EKBVEWebSurfaceState, NewState);

/** Flat in-world web surface. Self-contained — needs no UMG asset to function. */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent), DisplayName = "KBVE Web Surface")
class KBVEWEBSURFACE_API UKBVEWebSurfaceComponent : public UWidgetComponent
{
	GENERATED_BODY()

public:
	UKBVEWebSurfaceComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface")
	FString InitialURL;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface|Perf", meta = (ClampMin = "1", ClampMax = "120"))
	int32 MaxFrameRate;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface|Perf")
	bool bPauseWhenOffscreen;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface|Perf", meta = (ClampMin = "0"))
	float SnapshotDistance;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface|Bridge")
	FName BridgeName;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|WebSurface")
	FKBVEWebSurfaceStateChanged OnStateChanged;

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface")
	void LoadURL(const FString& URL);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface")
	void LoadURLWithFragmentToken(const FString& URL, const FString& Token);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface")
	void ExecuteJavaScript(const FString& Script);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface")
	void Reload();

	UFUNCTION(BlueprintPure, Category = "KBVE|WebSurface")
	UKBVEWebBridge* GetBridge() const { return Bridge; }

	UFUNCTION(BlueprintPure, Category = "KBVE|WebSurface")
	EKBVEWebSurfaceState GetState() const { return State; }

	UFUNCTION(BlueprintPure, Category = "KBVE|WebSurface")
	UWebBrowser* GetWebBrowser();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	UPROPERTY(Transient)
	TObjectPtr<UWebBrowser> WebBrowser;

	UPROPERTY(Transient)
	TObjectPtr<UKBVEWebBridge> Bridge;

	EKBVEWebSurfaceState State = EKBVEWebSurfaceState::Inactive;
	float RedrawAccumulator = 0.f;

	UWebBrowser* ResolveBrowser();
	void EnsureBridge();
	void TransitionTo(EKBVEWebSurfaceState NewState);
	float DistanceToLocalViewer() const;
	bool ShouldPauseForOffscreen() const;
};
