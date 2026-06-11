#pragma once

#include "CoreMinimal.h"
#include "chuckPlayerController.h"
#include "chuckCorePlayerController.generated.h"

class SchuckHUD;
class SchuckPauseMenu;
class SKBVEDevOverlay;
class SchuckHotbar;
class SchuckInventoryWindow;
class SKBVELoginWidget;
class SKBVEAccountPanel;
class SKBVEChatPanel;
class SKBVETooltip;
class SKBVEDragArrowLayer;
class SKBVESettingsFrame;
class SchuckToastHost;
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
	void OnToggleSettingsPressed(const FInputActionValue& Value);
	void OnToggleDevOverlayPressed(const FInputActionValue& Value);
	void OnInventoryPressed(const FInputActionValue& Value);
	void OnToggleChatPressed(const FInputActionValue& Value);
	void OnFocusChatPressed(const FInputActionValue& Value);
	void OnInteractPressed(const FInputActionValue& Value);

	void OpenInventory();
	void CloseInventory();

	void PauseGame();
	void ResumeGame();
	void OpenSettings();
	void CloseSettings();
	void ToggleSettings();
	void ResetSettingsToDefaults();
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
	TSharedPtr<SKBVEDevOverlay>       DevOverlayWidget;
	TSharedPtr<SchuckHotbar>          HotbarWidget;
	TSharedPtr<SchuckInventoryWindow> InventoryWidget;
	TSharedPtr<SKBVELoginWidget>      LoginWidget;
	TSharedPtr<SKBVEAccountPanel>     AccountWidget;
	TSharedPtr<SKBVEChatPanel>        ChatWidget;
	TSharedPtr<SKBVETooltip>          TooltipWidget;
	TSharedPtr<SKBVEDragArrowLayer>   DragArrowLayer;
	TSharedPtr<SKBVESettingsFrame>    SettingsWidget;
	TSharedPtr<SchuckToastHost>       ToastHostWidget;

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

	enum class EUiFlag : uint32
	{
		None        = 0,
		Inventory   = 1u << 0,
		Pause       = 1u << 1,
		DevOverlay  = 1u << 2,
		Chat        = 1u << 3,
		ChatFocused = 1u << 4,
		Settings    = 1u << 5,
		Map         = 1u << 6,
		Quest       = 1u << 7,
		Loading     = 1u << 8,
		Vendor      = 1u << 9,
		Tooltip     = 1u << 10,
		Targeting   = 1u << 11,
		DragArrow   = 1u << 12,
		MouseHidden = 1u << 13,
		AllowMove   = 1u << 14,
		AllowCamera = 1u << 15,
		Account     = 1u << 16,
	};

	uint32 UiFlags = 0;

	bool HasUiFlag(EUiFlag F) const { return (UiFlags & static_cast<uint32>(F)) != 0; }
	bool HasAllUiFlags(uint32 Mask) const { return (UiFlags & Mask) == Mask; }
	bool HasAnyUiFlags(uint32 Mask) const { return (UiFlags & Mask) != 0; }
	void SetUiFlag(EUiFlag F, bool bOn);
	bool AnyUiFlag() const { return UiFlags != 0; }
	uint32 GetUiFlags() const { return UiFlags; }
	uint32 DiffUiFlags(uint32 Prev) const { return UiFlags ^ Prev; }
	void BroadcastUiFlagsChanged(uint32 OldFlags);
	void ApplyUiFlagsVisibility();

	static constexpr uint32 BlockMovementMask =
		static_cast<uint32>(EUiFlag::Inventory) |
		static_cast<uint32>(EUiFlag::Pause) |
		static_cast<uint32>(EUiFlag::Settings) |
		static_cast<uint32>(EUiFlag::Map) |
		static_cast<uint32>(EUiFlag::Loading) |
		static_cast<uint32>(EUiFlag::Vendor);

	static constexpr uint32 NeedsCursorMask =
		static_cast<uint32>(EUiFlag::Inventory) |
		static_cast<uint32>(EUiFlag::Pause) |
		static_cast<uint32>(EUiFlag::DevOverlay) |
		static_cast<uint32>(EUiFlag::Chat) |
		static_cast<uint32>(EUiFlag::Settings) |
		static_cast<uint32>(EUiFlag::Map) |
		static_cast<uint32>(EUiFlag::Quest) |
		static_cast<uint32>(EUiFlag::Vendor);

	float LastHealthForFlash = -1.f;
	float LastDamageTime     = -10.f;

	bool   bSpawnSnapPending  = false;
	float  SpawnSnapElapsed   = 0.f;
	uint32 SpawnSnapSeed      = 0;
	FVector2D SpawnSnapAnchor = FVector2D::ZeroVector;
	bool   bDidAutoSpawnArcade = false;
	bool   bDidAutoSpawnSlimes = false;

	UPROPERTY(Transient)
	TSubclassOf<class AchuckArcadeCabinet> CachedArcadeClass;

	void TickSpawnSnap(float DeltaSeconds);
};
