#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "HexWorldTestActor.generated.h"

UCLASS()
class KBVEHEXWORLD_API AHexWorldTestActor : public AActor
{
	GENERATED_BODY()

public:
	AHexWorldTestActor();

protected:
	virtual void BeginPlay() override;

private:
	UPROPERTY(EditAnywhere, Category = "HexWorld|Test")
	int64 TestWorldSeed = 42;

	UPROPERTY(EditAnywhere, Category = "HexWorld|Test")
	int32 TestContentVersion = 1;
};
