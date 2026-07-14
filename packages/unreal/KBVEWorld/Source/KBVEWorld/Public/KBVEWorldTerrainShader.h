#pragma once

#include "CoreMinimal.h"

class UMaterialInterface;
class UObject;

class KBVEWORLD_API FKBVEWorldTerrainShader
{
public:
	static UMaterialInterface* GetOrCreateGroundMaterial(UObject* Outer);
};
