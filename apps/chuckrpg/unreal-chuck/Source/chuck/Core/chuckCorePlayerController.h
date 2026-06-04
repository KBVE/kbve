#pragma once

#include "CoreMinimal.h"
#include "chuckPlayerController.h"
#include "chuckCorePlayerController.generated.h"

class SchuckHUD;

UCLASS()
class AchuckCorePlayerController : public AchuckPlayerController
{
	GENERATED_BODY()

public:
	AchuckCorePlayerController();

	virtual void Tick(float DeltaSeconds) override;

protected:
	virtual void PostInitializeComponents() override;
	virtual void OnPossess(APawn* InPawn) override;
	virtual void OnUnPossess() override;

private:
	TSharedPtr<SchuckHUD> HUDWidget;
};
