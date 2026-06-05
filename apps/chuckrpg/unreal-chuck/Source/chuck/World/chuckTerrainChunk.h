#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckTerrainChunk.generated.h"

class UProceduralMeshComponent;
class UStaticMeshComponent;
class UMaterialInterface;

UCLASS()
class AchuckTerrainChunk : public AActor
{
	GENERATED_BODY()

public:
	AchuckTerrainChunk();

	void Build(const FIntPoint& InCoord, uint32 InSeed, int32 InCellsPerEdge, float InCellSize, float InWaterZ);
	void Release();

	const FIntPoint& GetCoord() const { return Coord; }
	bool  IsActive() const { return bActive; }

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Water;

	UPROPERTY()
	TObjectPtr<UMaterialInterface> GroundMaterial;

	UPROPERTY()
	TObjectPtr<UMaterialInterface> WaterMaterial;

	FIntPoint Coord = FIntPoint::ZeroValue;
	uint32  Seed = 0;
	int32   CellsPerEdge = 32;
	float   CellSize     = 200.f;
	float   WaterZ       = -120.f;
	bool    bActive      = false;
};
