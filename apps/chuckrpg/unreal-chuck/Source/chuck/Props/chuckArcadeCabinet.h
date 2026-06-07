#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckArcadeCabinet.generated.h"

class UStaticMeshComponent;
class UPointLightComponent;
class USphereComponent;
class UKBVEWebSurfaceComponent;

UCLASS()
class AchuckArcadeCabinet : public AActor
{
	GENERATED_BODY()

public:
	AchuckArcadeCabinet();

	UFUNCTION(BlueprintCallable, Category = "Chuck|Arcade")
	void Activate();

	UFUNCTION(BlueprintCallable, Category = "Chuck|Arcade")
	void Deactivate();

	bool IsActive() const { return bIsActive; }

	static AchuckArcadeCabinet* GetNearby();
	static bool ActivateNearby();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

	UFUNCTION()
	void HandleBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UFUNCTION()
	void HandleEndOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex);

	UPROPERTY(VisibleAnywhere, Category = "Arcade")
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "Arcade")
	TObjectPtr<UPointLightComponent> ScreenLight;

	UPROPERTY(VisibleAnywhere, Category = "Arcade")
	TObjectPtr<USphereComponent> InteractionRadius;

	UPROPERTY(VisibleAnywhere, Category = "Arcade")
	TObjectPtr<UKBVEWebSurfaceComponent> ScreenSurface;

	UPROPERTY(EditAnywhere, Category = "Arcade")
	FString ArcadeURL = TEXT("https://kbve.com/arcade/");

	UPROPERTY(EditAnywhere, Category = "Arcade", meta = (ClampMin = "50"))
	float InteractionRadiusCm = 250.f;

	UPROPERTY(EditAnywhere, Category = "Arcade")
	bool bPreloadScreen = true;

	bool bIsActive = false;
};
