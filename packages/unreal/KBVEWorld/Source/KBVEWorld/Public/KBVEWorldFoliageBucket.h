#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldFoliageBucket.generated.h"

UENUM(BlueprintType)
enum class EKBVEWorldFoliageTier : uint8 { Grass, Foliage };

USTRUCT(BlueprintType)
struct KBVEWORLD_API FKBVEWorldFoliageMeta
{
	GENERATED_BODY()
	UPROPERTY() FFloatInterval ScaleX = FFloatInterval(0.8f, 1.2f);
	UPROPERTY() FFloatInterval ScaleY = FFloatInterval(0.8f, 1.2f);
	UPROPERTY() FFloatInterval ScaleZ = FFloatInterval(0.8f, 1.2f);
	UPROPERTY() FFloatInterval ZOffset = FFloatInterval(0.f, 0.f);
	UPROPERTY() bool RandomYaw = true;
	UPROPERTY() EKBVEWorldFoliageTier Tier = EKBVEWorldFoliageTier::Grass;
};

class UStaticMesh;

USTRUCT(BlueprintType)
struct KBVEWORLD_API FKBVEWorldFoliageBucketConfig
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere) FString SourcePath;
	UPROPERTY(EditAnywhere) TArray<FString> NameIncludes;
	UPROPERTY(EditAnywhere) TArray<FString> NameExcludes;
	UPROPERTY(EditAnywhere, meta = (ClampMin = "1")) int32 MaxVariants = 32;
	UPROPERTY(EditAnywhere) float DensityScale     = 1.0f;
	UPROPERTY(EditAnywhere) float ScaleMultiplier  = 1.0f;
	UPROPERTY(EditAnywhere) int32 CullStart        = 3000;
	UPROPERTY(EditAnywhere) int32 CullEnd          = 6000;
	UPROPERTY(EditAnywhere) bool  bCastShadow      = false;
	UPROPERTY(EditAnywhere) EKBVEWorldFoliageTier Tier = EKBVEWorldFoliageTier::Grass;

	UPROPERTY(EditAnywhere) TObjectPtr<UStaticMesh> ImpostorMesh;
	UPROPERTY(EditAnywhere) int32 ImpostorCullStart = 6000;
	UPROPERTY(EditAnywhere) int32 ImpostorCullEnd   = 20000;
	UPROPERTY(EditAnywhere) bool  bImpostorCastShadow = false;
	UPROPERTY(EditAnywhere, meta = (ClampMin = "0", ClampMax = "5")) int32 ForcedLODBias = 0;
	UPROPERTY(EditAnywhere) int32 WPODisableDistance = 4000;

	UPROPERTY(EditAnywhere) float SinkDepth = 5.f;
	UPROPERTY(EditAnywhere, meta = (ClampMin = "0", ClampMax = "8")) int32 NumCustomDataFloats = 4;
	UPROPERTY(EditAnywhere) uint8 BiomeId = 0;

	UPROPERTY(EditAnywhere) bool  bUseProceduralGrass = false;
	UPROPERTY(EditAnywhere, meta = (ClampMin = "1", ClampMax = "32")) int32 ProceduralVariantCount = 6;
	UPROPERTY(EditAnywhere) float ProceduralWidthMin  = 18.f;
	UPROPERTY(EditAnywhere) float ProceduralWidthMax  = 36.f;
	UPROPERTY(EditAnywhere) float ProceduralHeightMin = 40.f;
	UPROPERTY(EditAnywhere) float ProceduralHeightMax = 90.f;
	UPROPERTY(EditAnywhere) TSoftObjectPtr<UMaterialInterface> ProceduralMaterial;
};
