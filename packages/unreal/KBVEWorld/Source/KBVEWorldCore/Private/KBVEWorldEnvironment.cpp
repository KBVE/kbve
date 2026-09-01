#include "KBVEWorldEnvironment.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"

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
