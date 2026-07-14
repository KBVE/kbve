#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEHexWorldTypes.h"
#include "HexEnvironmentSubsystem.generated.h"

class ADirectionalLight;
class ASkyLight;
class ASkyAtmosphere;
class AExponentialHeightFog;

USTRUCT(BlueprintType)
struct KBVEHEXWORLD_API FHexEnvironmentSettings
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	FRotator SunRotation = FRotator(-45.0, 220.0, 0.0);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	float SunIntensity = 10.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	FLinearColor SunColor = FLinearColor(1.0f, 0.95f, 0.85f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	float SkyLightIntensity = 1.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	float FogDensity = 0.02f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	float FogHeightFalloff = 0.2f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	FLinearColor FogColor = FLinearColor(0.45f, 0.55f, 0.65f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	float FogStartDistance = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	float AtmosphereRayleighScale = 1.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Environment")
	float AtmosphereMieScale = 1.0f;
};

UCLASS()
class KBVEHEXWORLD_API UHexEnvironmentSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Spawn the base environment actors into the current world. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Environment")
	void SpawnEnvironment(UWorld* World);

	/** Tear down environment actors. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Environment")
	void DestroyEnvironment();

	/** Apply environment settings (e.g. when entering a new hex biome). */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Environment")
	void ApplySettings(const FHexEnvironmentSettings& Settings);

	/** Get default settings for a biome type. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Environment")
	static FHexEnvironmentSettings GetDefaultSettingsForBiome(EHexBiomeType Biome);

	/** Apply the default environment for a biome. Spawns actors if needed. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Environment")
	void ApplyBiome(UWorld* World, EHexBiomeType Biome);

private:
	UPROPERTY()
	TObjectPtr<ADirectionalLight> Sun;

	UPROPERTY()
	TObjectPtr<ASkyLight> SkyLight;

	UPROPERTY()
	TObjectPtr<ASkyAtmosphere> SkyAtmosphere;

	UPROPERTY()
	TObjectPtr<AExponentialHeightFog> Fog;

	FHexEnvironmentSettings CurrentSettings;
};
