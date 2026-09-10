#include "KBVEWorldEnvironment.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Engine/World.h"
#include "Kismet/KismetMaterialLibrary.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialParameterCollection.h"

DEFINE_LOG_CATEGORY(LogKBVEWorldEnv);

AKBVEWorldEnvironment::AKBVEWorldEnvironment()
{
	PrimaryActorTick.bCanEverTick = false;

	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	Sun = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Sun"));
	Sun->SetupAttachment(Root);
	// Movable, not Stationary: the sun rotates and nothing here is baked, so a
	// Stationary light would try to precompute lighting that cannot exist.
	Sun->SetMobility(EComponentMobility::Movable);
	// What makes SkyAtmosphere take its sun direction from this light. Without
	// it the sky ignores the rotation and the horizon disagrees with shadows.
	Sun->bAtmosphereSunLight = true;
	Sun->bCastVolumetricShadow = false;

	SkyAtmosphere = CreateDefaultSubobject<USkyAtmosphereComponent>(TEXT("SkyAtmosphere"));
	SkyAtmosphere->SetupAttachment(Root);

	SkyLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SkyLight"));
	SkyLight->SetupAttachment(Root);
	SkyLight->SetMobility(EComponentMobility::Movable);
	SkyLight->SourceType = ESkyLightSourceType::SLS_CapturedScene;

	Fog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("Fog"));
	Fog->SetupAttachment(Root);

	// Hidden until asked for. The component exists whatever the setting says, so
	// turning weather on is a property change rather than a rebuild of the map.
	Clouds = CreateDefaultSubobject<UVolumetricCloudComponent>(TEXT("Clouds"));
	Clouds->SetupAttachment(Root);
	Clouds->SetVisibility(false);
}

FRotator AKBVEWorldEnvironment::QuantisedSunRotation() const
{
	float Elevation = SunElevationDegrees;
	float Azimuth = SunAzimuthDegrees;

	if (SunAngleStepDegrees > KINDA_SMALL_NUMBER)
	{
		Elevation = FMath::GridSnap(Elevation, SunAngleStepDegrees);
		Azimuth = FMath::GridSnap(Azimuth, SunAngleStepDegrees);
	}

	// Pitch is negative-down in Unreal, so a positive elevation points the light
	// downward at the world.
	return FRotator(-Elevation, Azimuth, 0.0f);
}

FVector AKBVEWorldEnvironment::GetSunDirection() const
{
	return QuantisedSunRotation().Vector();
}

void AKBVEWorldEnvironment::ApplyEnvironment()
{
	if (Sun)
	{
		Sun->SetWorldRotation(QuantisedSunRotation());
		Sun->SetIntensity(SunIntensity);
		Sun->SetLightColor(SunColor);
		Sun->DynamicShadowDistanceMovableLight = DynamicShadowDistance;
		Sun->MarkRenderStateDirty();
	}

	if (SkyLight)
	{
		SkyLight->SetIntensity(SkyLightIntensity);
		SkyLight->bRealTimeCapture = bSkyLightRealTimeCapture;
		SkyLight->MarkRenderStateDirty();
	}

	if (Fog)
	{
		Fog->SetFogDensity(FogDensity);
		Fog->SetFogHeightFalloff(FogHeightFalloff);
		Fog->SetFogInscatteringColor(FogColor);
		Fog->MarkRenderStateDirty();
	}

	if (Clouds)
	{
		Clouds->SetVisibility(bCloudsEnabled);
		if (bCloudsEnabled)
		{
			// Kilometres in the property, because that is the unit a cloud layer
			// is discussed in; the component wants them too, so nothing here
			// converts and nothing here can convert wrongly.
			Clouds->SetLayerBottomAltitude(CloudBottomKm);
			Clouds->SetLayerHeight(CloudThicknessKm);
			if (CloudTracingStartMaxDistanceKm > 0.0f)
			{
				Clouds->SetTracingStartMaxDistance(CloudTracingStartMaxDistanceKm);
			}
			if (UMaterialInterface* Sheet = CloudMaterial.LoadSynchronous())
			{
				Clouds->SetMaterial(Sheet);
			}
		}
		Clouds->MarkRenderStateDirty();
	}

	if (Sun)
	{
		// Shadowing is asked of the light rather than of the cloud, and only
		// while there are clouds to cast them: left on with the layer hidden it
		// is a shadow map built every frame for nothing.
		Sun->bCastCloudShadows = bCloudsEnabled && bCloudShadows;
		Sun->CloudShadowStrength = CloudShadowStrength;
		Sun->MarkRenderStateDirty();
	}

	PublishWind();
}

void AKBVEWorldEnvironment::PublishWind()
{
	UMaterialParameterCollection* Collection = WindCollection.LoadSynchronous();
	if (!Collection || !GetWorld())
	{
		return;
	}

	// Normalised on the way out so the property can be written as a plain
	// direction. A heading that is also a magnitude is a heading that silently
	// changes the wind's strength every time someone turns it.
	const FVector2D Heading = WindTravelDirection.GetSafeNormal();

	UKismetMaterialLibrary::SetVectorParameterValue(GetWorld(), Collection,
		TEXT("WindTravelDirection"), FLinearColor(Heading.X, Heading.Y, 0.0f, 0.0f));
	UKismetMaterialLibrary::SetScalarParameterValue(GetWorld(), Collection,
		TEXT("WindSpeed"), WindSpeed);
	UKismetMaterialLibrary::SetScalarParameterValue(GetWorld(), Collection,
		TEXT("WindStrength"), WindStrength);

	UE_LOG(LogKBVEWorldEnv, Display,
		TEXT("wind travelling (%.2f, %.2f) at %.2f, strength %.2f"),
		Heading.X, Heading.Y, WindSpeed, WindStrength);
}

void AKBVEWorldEnvironment::SetSunAngle(float ElevationDegrees, float AzimuthDegrees)
{
	SunElevationDegrees = FMath::Clamp(ElevationDegrees, -90.0f, 90.0f);
	SunAzimuthDegrees = FMath::Fmod(AzimuthDegrees + 360.0f, 360.0f);
	ApplyEnvironment();
}

void AKBVEWorldEnvironment::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	ApplyEnvironment();
}

void AKBVEWorldEnvironment::BeginPlay()
{
	Super::BeginPlay();
	ApplyEnvironment();

	const FVector Dir = GetSunDirection();
	UE_LOG(LogKBVEWorldEnv, Display,
		TEXT("environment ready: sun elev=%.2f az=%.2f dir=(%.3f, %.3f, %.3f) step=%.2f"),
		SunElevationDegrees, SunAzimuthDegrees, Dir.X, Dir.Y, Dir.Z, SunAngleStepDegrees);
}

#if WITH_EDITOR
void AKBVEWorldEnvironment::PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent)
{
	Super::PostEditChangeProperty(PropertyChangedEvent);
	// So dragging a slider in the details panel updates the viewport, rather
	// than only taking effect on the next construction.
	ApplyEnvironment();
}
#endif
