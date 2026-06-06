#pragma once

#include "CoreMinimal.h"

class UMaterial;
class UMaterialInterface;
class UObject;

class KBVEWORLD_API FKBVEWorldGrassShader
{
public:
	static UMaterialInterface* GetOrCreateMasterMaterial(UObject* Outer);
};
