#include "HexEnvironmentSubsystem.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Atmosphere/AtmosphericFogComponent.h"
#include "Engine/ExponentialHeightFog.h"

void UHexEnvironmentSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UHexEnvironmentSubsystem::Deinitialize()
{
	DestroyEnvironment();
	Super::Deinitialize();
}

void UHexEnvironmentSubsystem::SpawnEnvironment(UWorld* World)
{
	if (!World)
	{
		return;
	}

	DestroyEnvironment();

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	// -- Directional Light (sun) --
	SpawnParams.Name = TEXT("KBVEHexWorld_Sun");
	Sun = World->SpawnActor<ADirectionalLight>(FVector::ZeroVector, CurrentSettings.SunRotation, SpawnParams);
	if (Sun)
	{
		UDirectionalLightComponent* LightComp = Sun->GetComponent();
		LightComp->SetIntensity(CurrentSettings.SunIntensity);
		LightComp->SetLightColor(CurrentSettings.SunColor);
		LightComp->SetAtmosphereSunLight(true);
	}

	// -- Sky Atmosphere --
	SpawnParams.Name = TEXT("KBVEHexWorld_SkyAtmosphere");
	SkyAtmosphere = World->SpawnActor<ASkyAtmosphere>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);

	// -- Sky Light --
	SpawnParams.Name = TEXT("KBVEHexWorld_SkyLight");
	SkyLight = World->SpawnActor<ASkyLight>(FVector(0.0, 0.0, 10000.0), FRotator::ZeroRotator, SpawnParams);
	if (SkyLight)
	{
		USkyLightComponent* SkyComp = SkyLight->GetLightComponent();
		SkyComp->SetIntensity(CurrentSettings.SkyLightIntensity);
		SkyComp->bRealTimeCapture = true;
		SkyComp->RecaptureSky();
	}

	// -- Exponential Height Fog --
	SpawnParams.Name = TEXT("KBVEHexWorld_Fog");
	Fog = World->SpawnActor<AExponentialHeightFog>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
	if (Fog)
	{
		UExponentialHeightFogComponent* FogComp = Fog->GetComponent();
		FogComp->SetFogDensity(CurrentSettings.FogDensity);
		FogComp->SetFogHeightFalloff(CurrentSettings.FogHeightFalloff);
		FogComp->SetFogInscatteringColor(CurrentSettings.FogColor);
		FogComp->SetStartDistance(CurrentSettings.FogStartDistance);
	}
}

void UHexEnvironmentSubsystem::DestroyEnvironment()
{
	if (Sun)       { Sun->Destroy();           Sun = nullptr; }
	if (SkyLight)  { SkyLight->Destroy();      SkyLight = nullptr; }
	if (SkyAtmosphere) { SkyAtmosphere->Destroy(); SkyAtmosphere = nullptr; }
	if (Fog)       { Fog->Destroy();           Fog = nullptr; }
}

void UHexEnvironmentSubsystem::ApplySettings(const FHexEnvironmentSettings& Settings)
{
	CurrentSettings = Settings;

	if (Sun)
	{
		Sun->SetActorRotation(Settings.SunRotation);
		UDirectionalLightComponent* LightComp = Sun->GetComponent();
		LightComp->SetIntensity(Settings.SunIntensity);
		LightComp->SetLightColor(Settings.SunColor);
	}

	if (SkyLight)
	{
		USkyLightComponent* SkyComp = SkyLight->GetLightComponent();
		SkyComp->SetIntensity(Settings.SkyLightIntensity);
		SkyComp->RecaptureSky();
	}

	if (Fog)
	{
		UExponentialHeightFogComponent* FogComp = Fog->GetComponent();
		FogComp->SetFogDensity(Settings.FogDensity);
		FogComp->SetFogHeightFalloff(Settings.FogHeightFalloff);
		FogComp->SetFogInscatteringColor(Settings.FogColor);
		FogComp->SetStartDistance(Settings.FogStartDistance);
	}
}

FHexEnvironmentSettings UHexEnvironmentSubsystem::GetDefaultSettingsForBiome(EHexBiomeType Biome)
{
	FHexEnvironmentSettings S;

	switch (Biome)
	{
	case EHexBiomeType::Plains:
		S.SunRotation = FRotator(-45.0, 220.0, 0.0);
		S.SunIntensity = 10.0f;
		S.SunColor = FLinearColor(1.0f, 0.95f, 0.85f);
		S.SkyLightIntensity = 1.0f;
		S.FogDensity = 0.005f;
		S.FogHeightFalloff = 0.2f;
		S.FogColor = FLinearColor(0.6f, 0.7f, 0.85f);
		break;

	case EHexBiomeType::Forest:
		S.SunRotation = FRotator(-35.0, 180.0, 0.0);
		S.SunIntensity = 6.0f;
		S.SunColor = FLinearColor(0.95f, 0.9f, 0.7f);
		S.SkyLightIntensity = 0.7f;
		S.FogDensity = 0.04f;
		S.FogHeightFalloff = 0.3f;
		S.FogColor = FLinearColor(0.35f, 0.45f, 0.3f);
		break;

	case EHexBiomeType::Swamp:
		S.SunRotation = FRotator(-25.0, 200.0, 0.0);
		S.SunIntensity = 4.0f;
		S.SunColor = FLinearColor(0.8f, 0.75f, 0.6f);
		S.SkyLightIntensity = 0.5f;
		S.FogDensity = 0.1f;
		S.FogHeightFalloff = 0.15f;
		S.FogColor = FLinearColor(0.3f, 0.35f, 0.25f);
		break;

	case EHexBiomeType::Desert:
		S.SunRotation = FRotator(-60.0, 200.0, 0.0);
		S.SunIntensity = 14.0f;
		S.SunColor = FLinearColor(1.0f, 0.92f, 0.75f);
		S.SkyLightIntensity = 1.5f;
		S.FogDensity = 0.002f;
		S.FogHeightFalloff = 0.1f;
		S.FogColor = FLinearColor(0.85f, 0.75f, 0.55f);
		break;

	case EHexBiomeType::Mountain:
		S.SunRotation = FRotator(-40.0, 240.0, 0.0);
		S.SunIntensity = 8.0f;
		S.SunColor = FLinearColor(0.9f, 0.92f, 1.0f);
		S.SkyLightIntensity = 1.2f;
		S.FogDensity = 0.03f;
		S.FogHeightFalloff = 0.05f;
		S.FogColor = FLinearColor(0.7f, 0.75f, 0.85f);
		break;

	case EHexBiomeType::Coastal:
		S.SunRotation = FRotator(-50.0, 160.0, 0.0);
		S.SunIntensity = 11.0f;
		S.SunColor = FLinearColor(1.0f, 0.97f, 0.9f);
		S.SkyLightIntensity = 1.3f;
		S.FogDensity = 0.015f;
		S.FogHeightFalloff = 0.25f;
		S.FogColor = FLinearColor(0.5f, 0.65f, 0.8f);
		break;

	case EHexBiomeType::Underground:
		S.SunRotation = FRotator(-90.0, 0.0, 0.0);
		S.SunIntensity = 0.0f;
		S.SunColor = FLinearColor(0.0f, 0.0f, 0.0f);
		S.SkyLightIntensity = 0.05f;
		S.FogDensity = 0.08f;
		S.FogHeightFalloff = 0.5f;
		S.FogColor = FLinearColor(0.05f, 0.05f, 0.08f);
		break;

	case EHexBiomeType::Ruins:
		S.SunRotation = FRotator(-30.0, 260.0, 0.0);
		S.SunIntensity = 5.0f;
		S.SunColor = FLinearColor(0.85f, 0.8f, 0.7f);
		S.SkyLightIntensity = 0.6f;
		S.FogDensity = 0.06f;
		S.FogHeightFalloff = 0.2f;
		S.FogColor = FLinearColor(0.4f, 0.38f, 0.35f);
		break;

	default:
		break;
	}

	return S;
}

void UHexEnvironmentSubsystem::ApplyBiome(UWorld* World, EHexBiomeType Biome)
{
	CurrentSettings = GetDefaultSettingsForBiome(Biome);

	if (!Sun)
	{
		SpawnEnvironment(World);
	}
	else
	{
		ApplySettings(CurrentSettings);
	}
}
