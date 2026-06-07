#pragma once

#include "CoreMinimal.h"
#include "MassProcessor.h"
#include "KBVEStatRegenProcessor.generated.h"

UCLASS()
class KBVEGAMEPLAY_API UKBVEStatRegenProcessor : public UMassProcessor
{
	GENERATED_BODY()

public:
	UKBVEStatRegenProcessor();

protected:
	virtual void ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager) override;
	virtual void Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context) override;

	FMassEntityQuery EntityQuery;
};
