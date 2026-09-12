#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"

#include "RareIconHUD.generated.h"

class ARareIconPlayerPawn;
class SWidget;

/**
 * What the player reads while playing: the aiming mark, the weapon in hand and
 * the rack it came from.
 *
 * A subsystem, for the reason the loading screen is one -- the HUD belongs to
 * the session rather than to the map, so there is no actor to place and none to
 * forget when a second level exists.
 *
 * Deliberately not a health bar. Nothing damages the player yet, so a vitals
 * readout would be a bar that is always full: decoration claiming to be a
 * reading. It goes in when there is something to read.
 */
UCLASS()
class URareIconHUD : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Deinitialize() override;

private:
	/** The pawn, or null while there is not one yet. Asked per use, never cached. */
	ARareIconPlayerPawn* Player() const;

	TSharedRef<SWidget> BuildWeaponSlot(int32 Index);

	TSharedPtr<SWidget> Root;
};
