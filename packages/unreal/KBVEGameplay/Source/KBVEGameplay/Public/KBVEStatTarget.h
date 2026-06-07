#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "KBVEGameplayTypes.h"
#include "KBVEStatTarget.generated.h"

UINTERFACE(MinimalAPI)
class UKBVEStatTarget : public UInterface
{
	GENERATED_BODY()
};

class KBVEGAMEPLAY_API IKBVEStatTarget
{
	GENERATED_BODY()

public:
	virtual float GetStatValue(FName StatId) const { return 0.f; }
	virtual float GetStatMax(FName StatId) const { return 0.f; }
	virtual void  ApplyStatDelta(FName StatId, float Delta) {}
	virtual void  AddStatModifier(FName StatId, FName ModifierKey, float Magnitude, EKBVEStatOp Op) {}
	virtual void  RemoveStatModifier(FName StatId, FName ModifierKey) {}
};
