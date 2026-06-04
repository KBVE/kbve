#pragma once

#include "CoreMinimal.h"
#include "chuckPlayerController.h"
#include "chuckCorePlayerController.generated.h"

class SchuckHUD;
class SchuckPauseMenu;
class SchuckDevOverlay;
struct FInputActionValue;

UCLASS()
class AchuckCorePlayerController : public AchuckPlayerController
{
	GENERATED_BODY()

public:
	AchuckCorePlayerController();

	virtual void Tick(float DeltaSeconds) override;

protected:
	virtual void PostInitializeComponents() override;
	virtual void SetupInputComponent() override;
	virtual void OnPossess(APawn* InPawn) override;
	virtual void OnUnPossess() override;

	void OnPausePressed(const FInputActionValue& Value);
	void OnToggleDevOverlayPressed(const FInputActionValue& Value);

	void PauseGame();
	void ResumeGame();
	void QuitToMainMenu();
	void QuitGame();

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Menu")
	FName MainMenuLevelName = TEXT("L_MainMenu");

private:
	TSharedPtr<SchuckHUD>        HUDWidget;
	TSharedPtr<SchuckPauseMenu>  PauseWidget;
	TSharedPtr<SchuckDevOverlay> DevOverlayWidget;

	bool bGamePaused      = false;
	bool bDevOverlayShown = false;

	float LastHealthForFlash = -1.f;
	float LastDamageTime     = -10.f;
};
