#pragma once

#include "CoreMinimal.h"
#include "Components/WidgetComponent.h"
#include "KBVEWebSurfaceComponent.generated.h"

class UWebBrowser;

/** Flat in-world web surface backed by a UMG WebBrowser widget. */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent), DisplayName = "KBVE Web Surface")
class KBVEWEBSURFACE_API UKBVEWebSurfaceComponent : public UWidgetComponent
{
	GENERATED_BODY()

public:
	UKBVEWebSurfaceComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface")
	FString InitialURL;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface|Perf", meta = (ClampMin = "0", ClampMax = "120"))
	int32 MaxFrameRate;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface|Perf")
	bool bPauseWhenOffscreen;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|WebSurface|Perf", meta = (ClampMin = "0"))
	float SnapshotDistance;

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface")
	void LoadURL(const FString& URL);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface")
	void ExecuteJavaScript(const FString& Script);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface")
	void Reload();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	UPROPERTY(Transient)
	TObjectPtr<UWebBrowser> WebBrowser;

	UWebBrowser* ResolveBrowser();
};
