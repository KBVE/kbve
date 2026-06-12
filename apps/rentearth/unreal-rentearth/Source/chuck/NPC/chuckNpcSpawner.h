#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "chuckNpcSpawner.generated.h"

class UKBVEMovementPolicy;

UCLASS()
class CHUCK_API UchuckNpcSpawner : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	void SpawnCreature(FName NpcRef, const FVector& Center, int32 Count, float Radius);

private:
	UPROPERTY(Transient)
	TObjectPtr<UKBVEMovementPolicy> Policy;

	UKBVEMovementPolicy* GetPolicy();
};
