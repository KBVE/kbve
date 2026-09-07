#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"

#include "RareIconMenu.generated.h"

class SBox;
class SWidget;

/** Which page the menu is showing, if any. */
enum class ERareIconMenuPage : uint8
{
	Hidden,
	Root,
	Settings
};

/**
 * The front door and the way back out of it.
 *
 * Three things that are one thing: the menu the game opens on, the menu Escape
 * brings up during play, and the settings page both of them reach. They share a
 * panel because they are the same panel -- only the first button's label
 * changes, from Play to Resume.
 *
 * The opening menu does not pause. The world is still being built while it is
 * up (see URareIconLoadingScreen), and a paused world builds nothing, so
 * pausing here would trade a wait the player can spend reading a menu for a
 * wait they spend watching a progress bar. Escape during play does pause,
 * because by then there is a session to hold still.
 */
UCLASS()
class URareIconMenu : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Deinitialize() override;

	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

private:
	void Show(ERareIconMenuPage NewPage);
	void Hide();

	/** Escape: open the pause menu, back out of settings, or resume. */
	void OnEscape();

	TSharedRef<SWidget> BuildRootPage();
	TSharedRef<SWidget> BuildSettingsPage();
	TSharedRef<SWidget> BuildSettingsRows();

	void ApplyInputMode();

	ERareIconMenuPage Page = ERareIconMenuPage::Hidden;

	/** True until the player has left the opening menu for the first time. */
	bool bAtFrontDoor = true;

	/** Whether this menu is the reason the game is paused. */
	bool bPausedByMenu = false;

	bool bEscapeBound = false;

	TSharedPtr<SWidget> Root;

	/** The page holder, swapped between the root menu and settings. */
	TSharedPtr<SBox> Body;

	/** The settings rows, rebuilt when reset or cancel changes them underneath. */
	TSharedPtr<SBox> RowsHost;
};
