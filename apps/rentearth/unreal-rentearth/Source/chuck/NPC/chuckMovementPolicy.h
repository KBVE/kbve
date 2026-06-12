#pragma once

#include "CoreMinimal.h"
#include "KBVEMovementPolicy.h"
#include "chuckMovementPolicy.generated.h"

UCLASS()
class CHUCK_API UchuckMovementPolicy : public UKBVEMovementPolicy
{
	GENERATED_BODY()

public:
	virtual EKBVEMovementBackend ResolveBackend_Implementation(const FKBVEMovementContext& Context) const override;
};
