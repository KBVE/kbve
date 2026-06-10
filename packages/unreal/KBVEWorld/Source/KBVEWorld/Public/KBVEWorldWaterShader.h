#pragma once

#include "CoreMinimal.h"

class UMaterialInterface;
class UObject;

class KBVEWORLD_API FKBVEWorldWaterShader
{
public:
	static UMaterialInterface* GetOrCreateWaterMaterial(UObject* Outer);
};
