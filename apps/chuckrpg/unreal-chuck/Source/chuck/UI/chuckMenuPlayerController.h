#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "chuckMenuPlayerController.generated.h"

class SchuckMainMenu;

UCLASS()
class AchuckMenuPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AchuckMenuPlayerController();

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Menu")
	FName PlayLevelName = TEXT("Lvl_ThirdPerson");

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	void HandlePlay();
	void HandleQuit();

	TSharedPtr<SchuckMainMenu> MenuWidget;
};
