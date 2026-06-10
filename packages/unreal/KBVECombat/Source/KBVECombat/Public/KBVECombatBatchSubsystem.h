#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Containers/Queue.h"
#include "MassEntityHandle.h"
#include "KBVECombatTypes.h"
#include "KBVECombatBatchSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKBVEEntityDied, FMassEntityHandle, Entity, FMassEntityHandle, Killer);

UCLASS()
class KBVECOMBAT_API UKBVECombatBatchSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	void EnqueueDamage(const FKBVEDamageRequest& Request);

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FOnKBVEEntityDied OnEntityDied;

private:
	TQueue<FKBVEDamageRequest, EQueueMode::Mpsc> DamageQueue;
};
