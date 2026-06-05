#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVEWebFocusComponent.generated.h"

class APlayerController;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKBVEWebFocusChanged, bool, bFocused);

/**
 * Manages player input focus lifecycle for a terminal. EnterFocus shows the
 * mouse cursor, switches the controller to UI-only input, and broadcasts
 * OnFocusChanged(true). ExitFocus reverses. Consumer wires Press-E → Enter,
 * terminal.close channel → Exit.
 */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent), DisplayName = "KBVE Web Focus")
class KBVEWEBSURFACE_API UKBVEWebFocusComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVEWebFocusComponent();

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Focus")
	FKBVEWebFocusChanged OnFocusChanged;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Focus")
	void EnterFocus(APlayerController* PC);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Focus")
	void ExitFocus(APlayerController* PC);

	UFUNCTION(BlueprintPure, Category = "KBVE|Focus")
	bool IsFocused() const { return bFocused; }

private:
	bool bFocused = false;
};
