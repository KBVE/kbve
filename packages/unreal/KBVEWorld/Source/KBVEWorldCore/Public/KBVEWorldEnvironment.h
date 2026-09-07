#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "KBVEWorldEnvironment.generated.h"

class UDirectionalLightComponent;
class UExponentialHeightFogComponent;
class USkyAtmosphereComponent;
class USkyLightComponent;
class UMaterialParameterCollection;
class UMaterialInterface;
class UVolumetricCloudComponent;

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

	/**
	 * The one wind, published for every material that has to move in it.
	 *
	 * It lives on the environment because that is what it is a property of: the
	 * weather over the world, not a setting on the grass. Anything that answers
	 * it -- foliage now, cloud and rain and water later -- reads the same
	 * collection, so they cannot drift apart, and a gust or a turning storm is
	 * one write here rather than a rebuild of every material that moves.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Wind")
	TSoftObjectPtr<UMaterialParameterCollection> WindCollection;

	/**
	 * Where the weather is going, not where it comes from.
	 *
	 * Named for travel because both conventions are ordinary and the other one
	 * is the reverse of this: a meteorologist's north-westerly blows towards the
	 * south-east. A name needing that qualification every time it is read will
	 * eventually be read wrong by something that then leans the opposite way to
	 * everything else in the same frame.
	 *
	 * X is north and Y is east, so north-west is +X -Y. Normalised on push, so
	 * this can be written as a plain direction.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Wind")
	FVector2D WindTravelDirection = FVector2D(1.0f, -1.0f);

	/** How fast gusts travel along that heading. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Wind",
		meta = (ClampMin = "0.0"))
	float WindSpeed = 0.85f;

	/**
	 * A multiplier on how hard everything is pushed, not a distance.
	 *
	 * How far a given plant gives is a property of that plant and stays in its
	 * own material; this is the weather turning up for all of them at once.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Wind",
		meta = (ClampMin = "0.0"))
	float WindStrength = 1.0f;

	/**
	 * Weather in the sky, off by default.
	 *
	 * Volumetric cloud is a ray-marched participating medium and it is the most
	 * expensive thing this actor can switch on, so it is a decision the project
	 * makes with a number in front of it rather than a default someone inherits.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Clouds")
	bool bCloudsEnabled = false;

	/** Material the layer is marched through. Engine's simple cloud if unset. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Clouds")
	TSoftObjectPtr<UMaterialInterface> CloudMaterial;

	/** Height of the layer's underside above the ground, in kilometres. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Clouds",
		meta = (ClampMin = "0.1"))
	float CloudBottomKm = 5.0f;

	/** How deep the layer is, in kilometres. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Clouds",
		meta = (ClampMin = "0.1"))
	float CloudThicknessKm = 6.0f;

	/**
	 * Step length along the view ray, in kilometres.
	 *
	 * The cost knob. Coarser is cheaper and softens the cloud's edges; there is
	 * no correct value, only a budget.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Clouds",
		meta = (ClampMin = "0.01"))
	float CloudTracingStartMaxDistanceKm = 0.0f;

	/**
	 * Whether the clouds darken the ground under them.
	 *
	 * This is the half of the effect that is felt rather than looked at: a gust
	 * crossing the grass while the hillside behind it dims is weather, where a
	 * cloud that only exists overhead is scenery. It is also the half that costs
	 * a shadow map, so it is separable from drawing the clouds at all.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Clouds")
	bool bCloudShadows = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Clouds",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float CloudShadowStrength = 1.0f;

	/** Write the wind onto the shared collection. Called by ApplyEnvironment. */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Wind")
	void PublishWind();

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

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UVolumetricCloudComponent> Clouds;
};
