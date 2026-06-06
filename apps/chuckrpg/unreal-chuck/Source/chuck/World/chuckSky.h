#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckSky.generated.h"

class UDirectionalLightComponent;
class USkyAtmosphereComponent;
class USkyLightComponent;
class UExponentialHeightFogComponent;
class UStaticMeshComponent;
class UPostProcessComponent;

UCLASS()
class AchuckSky : public AActor
{
	GENERATED_BODY()

public:
	AchuckSky();

	virtual void Tick(float DeltaSeconds) override;

	void SetTimeOfDay(float NewHours01);
	float GetTimeOfDay() const { return TimeOfDay; }

protected:
	virtual void BeginPlay() override;

	void ApplyTimeOfDay();

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> SceneRoot;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UDirectionalLightComponent> Sun;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UDirectionalLightComponent> Moon;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USkyAtmosphereComponent> Atmosphere;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USkyLightComponent> SkyLight;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UExponentialHeightFogComponent> Fog;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPostProcessComponent> PostProcess;

	UPROPERTY(EditAnywhere, Category = "Chuck|Sky")
	float DayLengthSeconds = 7200.f;

	UPROPERTY(EditAnywhere, Category = "Chuck|Sky", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float StartTimeOfDay = 0.30f;

	float TimeOfDay = 0.30f;
};
