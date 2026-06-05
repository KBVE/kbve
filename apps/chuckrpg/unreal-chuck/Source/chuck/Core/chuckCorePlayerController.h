#pragma once

#include "CoreMinimal.h"
#include "chuckPlayerController.h"
#include "chuckCorePlayerController.generated.h"

class SchuckHUD;
class SchuckPauseMenu;
class SchuckDevOverlay;
class SchuckHotbar;
class SchuckInventoryWindow;
class SchuckLoginWidget;
class SchuckAccountPanel;
class SchuckChatPanel;
class SKBVETooltip;
class SKBVEDragArrowLayer;
class UKBVESupabaseSubsystem;
struct FInputActionValue;
struct FKBVESupabaseSession;
struct FKBVESupabaseError;
struct FKBVEChatMessage;

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
	void OnInventoryPressed(const FInputActionValue& Value);

	void OpenInventory();
	void CloseInventory();

	void PauseGame();
	void ResumeGame();
	void QuitToMainMenu();
	void QuitGame();

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Menu")
	FName MainMenuLevelName = TEXT("L_MainMenu");

	UFUNCTION()
	void HandleSupabaseSignedIn(const FKBVESupabaseSession& Session);
	UFUNCTION()
	void HandleSupabaseSignedOut();
	UFUNCTION()
	void HandleSupabaseAuthError(const FKBVESupabaseError& Error);
	UFUNCTION()
	void HandleChatConnected();
	UFUNCTION()
	void HandleChatDisconnected(int32 StatusCode, const FString& Reason);
	UFUNCTION()
	void HandleChatMessage(const FKBVEChatMessage& Message);

	void InitSupabaseBridge();
	void TearDownSupabaseBridge();
	void RefreshAuthOverlayVisibility(bool bSignedIn);

private:
	TSharedPtr<SchuckHUD>             HUDWidget;
	TSharedPtr<SchuckPauseMenu>       PauseWidget;
	TSharedPtr<SchuckDevOverlay>      DevOverlayWidget;
	TSharedPtr<SchuckHotbar>          HotbarWidget;
	TSharedPtr<SchuckInventoryWindow> InventoryWidget;
	TSharedPtr<SchuckLoginWidget>     LoginWidget;
	TSharedPtr<SchuckAccountPanel>    AccountWidget;
	TSharedPtr<SchuckChatPanel>       ChatWidget;
	TSharedPtr<SKBVETooltip>          TooltipWidget;
	TSharedPtr<SKBVEDragArrowLayer>   DragArrowLayer;

	UPROPERTY(Transient)
	TWeakObjectPtr<UKBVESupabaseSubsystem> SupabaseSubsystem;

	uint64 TooltipHandleId = 0;

	bool        bPendingTooltipShow    = false;
	bool        bPendingTooltipDirty   = false;
	FText       PendingTooltipTitle;
	FText       PendingTooltipSubtitle;
	FText       PendingTooltipBody;
	FLinearColor PendingTooltipTitleColor  = FLinearColor::White;
	FLinearColor PendingTooltipBorderColor = FLinearColor::White;
	FVector2D    PendingTooltipPos = FVector2D::ZeroVector;

	bool bGamePaused      = false;
	bool bDevOverlayShown = false;
	bool bInventoryOpen   = false;

	float LastHealthForFlash = -1.f;
	float LastDamageTime     = -10.f;
};
