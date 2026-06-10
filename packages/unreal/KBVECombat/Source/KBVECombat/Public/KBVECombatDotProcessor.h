#pragma once

#include "CoreMinimal.h"
#include "MassProcessor.h"
#include "KBVECombatDotProcessor.generated.h"

UCLASS()
class KBVECOMBAT_API UKBVECombatDotProcessor : public UMassProcessor
{
	GENERATED_BODY()

public:
	UKBVECombatDotProcessor();

protected:
	virtual void ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager) override;
	virtual void Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context) override;

	FMassEntityQuery EntityQuery;
};
