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
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") FString SourcePath;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") TArray<FString> NameIncludes;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") TArray<FString> NameExcludes;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage", meta = (ClampMin = "1")) int32 MaxVariants = 32;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") float DensityScale     = 1.0f;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") float ScaleMultiplier  = 1.0f;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") int32 CullStart        = 199000;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") int32 CullEnd          = 200000;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") bool  bCastShadow      = false;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") EKBVEWorldFoliageTier Tier = EKBVEWorldFoliageTier::Grass;

	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Impostor") TObjectPtr<UStaticMesh> ImpostorMesh;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Impostor") int32 ImpostorCullStart = 7000;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Impostor") int32 ImpostorCullEnd   = 20000;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Impostor") bool  bImpostorCastShadow = false;

	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|GroundTint") int32 GroundTintCullStart = 21500;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|GroundTint") int32 GroundTintCullEnd   = 35000;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage", meta = (ClampMin = "0", ClampMax = "5")) int32 ForcedLODBias = 0;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") int32 WPODisableDistance = 1800;

	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") float SinkDepth = 5.f;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage", meta = (ClampMin = "0", ClampMax = "8")) int32 NumCustomDataFloats = 4;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage") uint8 BiomeId = 0;

	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Procedural") bool  bUseProceduralGrass = false;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Procedural", meta = (ClampMin = "1", ClampMax = "32")) int32 ProceduralVariantCount = 6;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Procedural") float ProceduralWidthMin  = 18.f;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Procedural") float ProceduralWidthMax  = 36.f;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Procedural") float ProceduralHeightMin = 40.f;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Procedural") float ProceduralHeightMax = 90.f;
	UPROPERTY(EditAnywhere, Category = "KBVEWorld|Foliage|Procedural") TSoftObjectPtr<UMaterialInterface> ProceduralMaterial;
};
