#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEHexWorldTypes.h"
#include "HexNoiseSubsystem.h"
#include "HexTerrainActor.generated.h"

class UProceduralMeshComponent;
class UMaterialInstanceDynamic;

UCLASS()
class KBVEHEXWORLD_API AHexTerrainActor : public AActor
{
	GENERATED_BODY()

public:
	AHexTerrainActor();

	/** Generate terrain mesh for a hex at the given world center. */
	void GenerateTerrain(const FVector& HexCenter, double HexSize, int64 RegionSeed, const FHexNoiseSettings& NoiseSettings);

	/**
	 * Set LOD preset before calling GenerateTerrain.
	 * 0 = close (64x64, collision), 1 = mid (32x32), 2 = far (16x16)
	 */
	void SetLODPreset(int32 LODLevel);

protected:
	UPROPERTY(VisibleAnywhere, Category = "HexWorld|Terrain")
	TObjectPtr<UProceduralMeshComponent> TerrainMesh;

	// --- Grid ----------------------------------------------------

	UPROPERTY(EditAnywhere, Category = "HexWorld|Terrain", meta = (ClampMin = "4", ClampMax = "256"))
	int32 GridResolution = 64;

	UPROPERTY(EditAnywhere, Category = "HexWorld|Terrain")
	bool bEnableCollision = true;

	// --- Material (height-based GPU shading) ---------------------

	UPROPERTY(EditAnywhere, Category = "HexWorld|Terrain")
	FLinearColor GrassColor = FLinearColor(0.22f, 0.42f, 0.12f);

	UPROPERTY(EditAnywhere, Category = "HexWorld|Terrain")
	FLinearColor RockColor = FLinearColor(0.42f, 0.32f, 0.2f);

	UPROPERTY(EditAnywhere, Category = "HexWorld|Terrain")
	FLinearColor SnowColor = FLinearColor(0.9f, 0.92f, 0.95f);

	UPROPERTY(EditAnywhere, Category = "HexWorld|Terrain")
	float RockHeight = 400.0f;

	UPROPERTY(EditAnywhere, Category = "HexWorld|Terrain")
	float SnowHeight = 700.0f;

private:
	void BuildTerrainMaterial();

	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> TerrainMID;
};
