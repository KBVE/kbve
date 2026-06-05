#include "chuckSky.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SceneComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"

AchuckSky::AchuckSky()
{
	PrimaryActorTick.bCanEverTick = true;

	SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
	RootComponent = SceneRoot;

	Sun = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Sun"));
	Sun->SetupAttachment(RootComponent);
	Sun->Mobility = EComponentMobility::Movable;
	Sun->Intensity = 7.5f;
	Sun->LightColor = FColor::White;
	Sun->bAtmosphereSunLight = true;
	Sun->ForwardShadingPriority = 1;

	Moon = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Moon"));
	Moon->SetupAttachment(RootComponent);
	Moon->Mobility = EComponentMobility::Movable;
	Moon->Intensity = 0.6f;
	Moon->LightColor = FColor(180, 200, 255);
	Moon->bAtmosphereSunLight = true;
	Moon->ForwardShadingPriority = 0;
	Moon->AtmosphereSunLightIndex = 1;

	Atmosphere = CreateDefaultSubobject<USkyAtmosphereComponent>(TEXT("Atmosphere"));
	Atmosphere->SetupAttachment(RootComponent);

	SkyLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SkyLight"));
	SkyLight->SetupAttachment(RootComponent);
	SkyLight->Mobility = EComponentMobility::Movable;
	SkyLight->SourceType = ESkyLightSourceType::SLS_CapturedScene;
	SkyLight->bRealTimeCapture = true;
	SkyLight->Intensity = 1.0f;

	Fog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("Fog"));
	Fog->SetupAttachment(RootComponent);
	Fog->FogDensity = 0.03f;
	Fog->FogHeightFalloff = 0.2f;
	Fog->SetVolumetricFog(true);
}

void AchuckSky::BeginPlay()
{
	Super::BeginPlay();
	TimeOfDay = FMath::Frac(StartTimeOfDay);
	ApplyTimeOfDay();
}

void AchuckSky::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (DayLengthSeconds <= 0.f) return;
	TimeOfDay += DeltaSeconds / DayLengthSeconds;
	TimeOfDay = FMath::Frac(TimeOfDay);
	ApplyTimeOfDay();
}

void AchuckSky::SetTimeOfDay(float NewHours01)
{
	TimeOfDay = FMath::Frac(FMath::Clamp(NewHours01, 0.f, 1.f));
	ApplyTimeOfDay();
}

void AchuckSky::ApplyTimeOfDay()
{
	// 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
	const float SunAngleDeg  = TimeOfDay * 360.f - 90.f;       // sunrise at 0.25
	const float MoonAngleDeg = SunAngleDeg + 180.f;

	if (Sun)
	{
		Sun->SetWorldRotation(FRotator(SunAngleDeg, -30.f, 0.f));
	}
	if (Moon)
	{
		Moon->SetWorldRotation(FRotator(MoonAngleDeg, 150.f, 0.f));
	}

	// Color + intensity blend
	const float SunPitch = FMath::Sin(TimeOfDay * 2.f * PI - PI * 0.5f); // -1 night, +1 day
	const float DayFactor   = FMath::Clamp((SunPitch + 0.1f) / 1.1f, 0.f, 1.f);
	const float NightFactor = 1.f - DayFactor;

	const FLinearColor MidDay (1.00f, 0.97f, 0.92f);
	const FLinearColor Horizon(1.00f, 0.55f, 0.30f);
	const FLinearColor Night  (0.05f, 0.07f, 0.10f);

	const float Horizonness = FMath::Clamp(1.f - FMath::Abs(SunPitch) * 1.8f, 0.f, 1.f);
	FLinearColor SunCol = FMath::Lerp(MidDay, Horizon, Horizonness);
	SunCol = FMath::Lerp(Night, SunCol, DayFactor);

	if (Sun)
	{
		Sun->SetLightColor(SunCol);
		Sun->SetIntensity(FMath::Lerp(0.05f, 8.0f, DayFactor));
	}
	if (Moon)
	{
		Moon->SetIntensity(FMath::Lerp(0.0f, 0.8f, NightFactor));
	}
	if (SkyLight)
	{
		SkyLight->SetIntensity(FMath::Lerp(0.15f, 1.1f, DayFactor));
	}
	if (Fog)
	{
		Fog->SetFogInscatteringColor(FMath::Lerp(FLinearColor(0.02f, 0.04f, 0.08f), FLinearColor(0.55f, 0.75f, 1.0f), DayFactor));
	}
}
