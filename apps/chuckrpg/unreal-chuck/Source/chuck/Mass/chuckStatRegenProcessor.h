#pragma once

#include "CoreMinimal.h"
#include "MassProcessor.h"
#include "chuckStatRegenProcessor.generated.h"

UCLASS()
class UchuckStatRegenProcessor : public UMassProcessor
{
	GENERATED_BODY()

public:
	UchuckStatRegenProcessor();

protected:
	virtual void ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager) override;
	virtual void Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context) override;

	FMassEntityQuery EntityQuery;
};
