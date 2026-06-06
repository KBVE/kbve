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
	void OnToggleChatPressed(const FInputActionValue& Value);
	void OnFocusChatPressed(const FInputActionValue& Value);

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
	UFUNCTION()
	void HandleChatChannelJoined(const FString& Channel);
	UFUNCTION()
	void HandleChatChannelLeft(const FString& Channel);

	void InitSupabaseBridge();
	void TearDownSupabaseBridge();
	void RefreshAuthOverlayVisibility(bool bSignedIn);

	bool IsAnyUiPanelOpen() const;
	void RefreshUiMouseMode();

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

	enum class EUiFlag : uint16
	{
		None        = 0,
		Inventory   = 1 << 0,
		Pause       = 1 << 1,
		DevOverlay  = 1 << 2,
		Chat        = 1 << 3,
		ChatFocused = 1 << 4,
		Settings    = 1 << 5,
		Map         = 1 << 6,
		Quest       = 1 << 7,
		Loading     = 1 << 8,
		Vendor      = 1 << 9,
		Tooltip     = 1 << 10,
		Targeting   = 1 << 11,
		DragArrow   = 1 << 12,
		MouseHidden = 1 << 13,
		AllowMove   = 1 << 14,
		AllowCamera = 1 << 15,
	};

	uint16 UiFlags = 0;

	bool HasUiFlag(EUiFlag F) const { return (UiFlags & static_cast<uint16>(F)) != 0; }
	bool HasAllUiFlags(uint16 Mask) const { return (UiFlags & Mask) == Mask; }
	bool HasAnyUiFlags(uint16 Mask) const { return (UiFlags & Mask) != 0; }
	void SetUiFlag(EUiFlag F, bool bOn);
	bool AnyUiFlag() const { return UiFlags != 0; }
	uint16 GetUiFlags() const { return UiFlags; }
	uint16 DiffUiFlags(uint16 Prev) const { return UiFlags ^ Prev; }
	void BroadcastUiFlagsChanged(uint16 OldFlags);

	static constexpr uint16 BlockMovementMask =
		static_cast<uint16>(EUiFlag::Inventory) |
		static_cast<uint16>(EUiFlag::Pause) |
		static_cast<uint16>(EUiFlag::Settings) |
		static_cast<uint16>(EUiFlag::Map) |
		static_cast<uint16>(EUiFlag::Loading) |
		static_cast<uint16>(EUiFlag::Vendor);

	static constexpr uint16 NeedsCursorMask =
		static_cast<uint16>(EUiFlag::Inventory) |
		static_cast<uint16>(EUiFlag::Pause) |
		static_cast<uint16>(EUiFlag::DevOverlay) |
		static_cast<uint16>(EUiFlag::Chat) |
		static_cast<uint16>(EUiFlag::Settings) |
		static_cast<uint16>(EUiFlag::Map) |
		static_cast<uint16>(EUiFlag::Quest) |
		static_cast<uint16>(EUiFlag::Vendor);

	float LastHealthForFlash = -1.f;
	float LastDamageTime     = -10.f;

	bool   bSpawnSnapPending  = false;
	float  SpawnSnapElapsed   = 0.f;
	uint32 SpawnSnapSeed      = 0;
	FVector2D SpawnSnapAnchor = FVector2D::ZeroVector;

	void TickSpawnSnap(float DeltaSeconds);
};
