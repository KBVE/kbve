#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "KBVENpcSpriteDef.generated.h"

class UMaterialInterface;
class UTexture2D;

/**
 * Authoring data for a billboarded pixel-art NPC sprite. Atlas columns are animation
 * frames, rows are view directions (front / side / back; right is the side row mirrored).
 * Standalone for now; later keyed to an FKBVENpcDef Ref from the npcdb MDX pipeline.
 */
UCLASS(BlueprintType)
class KBVENPCSPRITE_API UKBVENpcSpriteDef : public UDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "NPC")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Sprite")
	TObjectPtr<UTexture2D> Atlas = nullptr;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Sprite")
	TObjectPtr<UMaterialInterface> SpriteMaterial = nullptr;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Atlas", meta = (ClampMin = "1"))
	int32 Columns = 5;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Atlas", meta = (ClampMin = "1"))
	int32 Rows = 3;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Atlas")
	int32 RowFront = 0;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Atlas")
	int32 RowSide = 1;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Atlas")
	int32 RowBack = 2;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Atlas")
	bool bSwapSide = false;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Animation", meta = (ClampMin = "1"))
	int32 FramesPerAnim = 5;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Animation", meta = (ClampMin = "0.0"))
	float Fps = 10.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "World")
	FVector2f WorldSize = FVector2f(128.0f, 128.0f);

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "World", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float PivotZ = 0.0f;
};
