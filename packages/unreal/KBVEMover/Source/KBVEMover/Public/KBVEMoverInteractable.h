#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "KBVEMoverInteractable.generated.h"

UINTERFACE(MinimalAPI, BlueprintType)
class UKBVEMoverInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * Implemented by world actors a Mover pawn can interact with. The pawn line-traces
 * forward on the Interact input and calls OnInteract on the first hit actor that
 * implements this interface.
 */
class IKBVEMoverInteractable
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintNativeEvent, Category = "KBVE|Mover|Interact")
	void OnInteract(AActor* Instigator);
};
