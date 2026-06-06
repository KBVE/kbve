#pragma once

#include "CoreMinimal.h"

class UStaticMesh;
class UObject;
class UMaterialInterface;

class KBVEWORLD_API FKBVEWorldProceduralGrass
{
public:
	struct FCardSpec
	{
		float Width  = 30.f;
		float Height = 60.f;
		int32 CardCount = 2;
		float BowAmount = 6.f;
		FName UniqueId  = TEXT("KBVEWorld_Grass_Default");
	};

	static UStaticMesh* GetOrCreateCardMesh(UObject* Outer, const FCardSpec& Spec, UMaterialInterface* Material);
	static UStaticMesh* GetOrCreateImpostorMesh(UObject* Outer, const FCardSpec& Spec, UMaterialInterface* Material);

	static void PopulateProceduralBucket(
		UObject* Outer,
		UMaterialInterface* Material,
		int32 VariantCount,
		float WidthMin, float WidthMax,
		float HeightMin, float HeightMax,
		TArray<UStaticMesh*>& OutMeshes,
		TArray<UStaticMesh*>* OutImpostorMeshes = nullptr);
};
