#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "KBVEWorldEnvironment.generated.h"

class UDirectionalLightComponent;
class UExponentialHeightFogComponent;
class USkyAtmosphereComponent;
class USkyLightComponent;

KBVEWORLDCORE_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVEWorldEnv, Log, All);

/**
 * A world's lighting, owned in C++ rather than authored into the level.
 *
 * Four components on one actor instead of four separate placed actors: there is
 * one thing to drop into a map, the values are code defaults that show up in a
 * diff, and the sun angle has a single owner. That last part is the real
 * reason -- the sun direction has to agree with the simulation side's shadow and
 * sky-visibility maths, and a rotation hand-set in a binary .umap is not a
 * value a headless server can read.
 */
UCLASS()
class KBVEWORLDCORE_API AKBVEWorldEnvironment : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldEnvironment();

	/**
	 * Sun elevation above the horizon, degrees. Negative is below (night).
	 * Low angles are the interesting case for terrain: a 500 m hill at 15
	 * casts a shadow roughly 1.9 km long.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Sun",
		meta = (ClampMin = "-90.0", ClampMax = "90.0"))
	float SunElevationDegrees = 45.0f;

	/** Compass direction the sun comes from, degrees. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Sun",
		meta = (ClampMin = "0.0", ClampMax = "360.0"))
	float SunAzimuthDegrees = 220.0f;

	/**
	 * Sun angle is snapped to this step before being applied.
	 *
	 * Load-bearing, not a tidiness knob. Neither Unreal nor Godot snaps shadow
	 * cascade texels to a world grid, so a continuously rotating sun reshuffles
	 * every shadow edge each frame and the whole scene crawls while standing
	 * still. Quantising the angle is what stops it. Zero disables snapping.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Sun",
		meta = (ClampMin = "0.0", ClampMax = "5.0"))
	float SunAngleStepDegrees = 0.15f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Sun")
	float SunIntensity = 10.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Sun")
	FLinearColor SunColor = FLinearColor(1.0f, 0.95f, 0.85f);

	/**
	 * Dynamic shadow distance, cm. The single biggest shadow cost lever, and a
	 * tier setting rather than a constant -- friendslop's range across quality
	 * tiers was 30 m to 200 m.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Sun")
	float DynamicShadowDistance = 12000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Sky")
	float SkyLightIntensity = 1.0f;

	/**
	 * Real-time capture re-renders the sky cubemap every frame. Ambient light
	 * only cares about average tone, so the full sky shader there is close to
	 * pure waste. Off until something proves it is needed.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Sky")
	bool bSkyLightRealTimeCapture = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Fog")
	float FogDensity = 0.02f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Fog")
	float FogHeightFalloff = 0.2f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Fog")
	FLinearColor FogColor = FLinearColor(0.45f, 0.55f, 0.65f);

	/** Push every property onto the components. Safe to call at any time. */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Environment")
	void ApplyEnvironment();

	/**
	 * Set the sun angle and reapply. The entry point a day/night cycle drives;
	 * snapping happens here so no caller has to remember it.
	 */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Sun")
	void SetSunAngle(float ElevationDegrees, float AzimuthDegrees);

	/** The quantised direction the sun points, for code that needs to agree. */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Sun")
	FVector GetSunDirection() const;

	UDirectionalLightComponent* GetSunComponent() const { return Sun; }

protected:
	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
#if WITH_EDITOR
	virtual void PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent) override;
#endif

private:
	/** Elevation/azimuth snapped to SunAngleStepDegrees. */
	FRotator QuantisedSunRotation() const;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UDirectionalLightComponent> Sun;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<USkyLightComponent> SkyLight;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<USkyAtmosphereComponent> SkyAtmosphere;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UExponentialHeightFogComponent> Fog;
};
