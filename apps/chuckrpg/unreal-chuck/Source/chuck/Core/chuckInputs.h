#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "chuckInputs.generated.h"

class UInputAction;
class UInputMappingContext;

UCLASS()
class UchuckInputs : public UObject
{
	GENERATED_BODY()

public:
	static UchuckInputs* Get();

	UPROPERTY() TObjectPtr<UInputAction>          Move;
	UPROPERTY() TObjectPtr<UInputAction>          Look;
	UPROPERTY() TObjectPtr<UInputAction>          Jump;
	UPROPERTY() TObjectPtr<UInputAction>          Sprint;
	UPROPERTY() TObjectPtr<UInputAction>          Crouch;
	UPROPERTY() TObjectPtr<UInputAction>          ToggleCamera;
	UPROPERTY() TObjectPtr<UInputAction>          Pause;
	UPROPERTY() TObjectPtr<UInputAction>          ToggleDevOverlay;
	UPROPERTY() TObjectPtr<UInputAction>          Inventory;
	UPROPERTY() TObjectPtr<UInputAction>          ToggleChat;
	UPROPERTY() TObjectPtr<UInputAction>          FocusChat;
	UPROPERTY() TObjectPtr<UInputMappingContext>  DefaultIMC;

protected:
	void Build();
};
