#pragma once

#include "CoreMinimal.h"
#include "KBVEEvents.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "chuckEventPayloads.h"
#include "chuckUIEvents.generated.h"

// Game-thread UI event hub. All channels here MUST be published from the
// game thread; subscribers touch Slate / UMG / Actors.
//
// Producers: AchuckCoreCharacter, AchuckCorePlayerController, server replication
// hooks. They call Get(World)->Health.Publish({...}) on game thread.
//
// Subscribers: SchuckHUD, SchuckHotbar, SchuckInventoryWindow, etc.
// Subscribe once on Construct with their owning UObject so the channel
// auto-unsubscribes on GC.
UCLASS()
class UchuckUIEvents : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	static UchuckUIEvents* Get(const UObject* WorldContext);

	TKBVEChannel<FKBVEHealthChangedPayload>   Health;
	TKBVEChannel<FKBVEManaChangedPayload>     Mana;
	TKBVEChannel<FKBVEEnergyChangedPayload>   Energy;
	TKBVEChannel<FKBVEStaminaChangedPayload>  Stamina;
	TKBVEChannel<FchuckInventoryDirtyPayload>  InventoryDirty;
	TKBVEChannel<FKBVEDamageReceivedPayload>  DamageReceived;
	TKBVEChannel<FchuckCrosshairPayload>       Crosshair;
	TKBVEChannel<FchuckTooltipPayload>         Tooltip;
	TKBVEChannel<FchuckItemConsumedPayload>    ItemConsumed;

	TKBVEChannel<FchuckAuthStatusPayload>      AuthStatus;
	TKBVEChannel<FchuckAuthErrorPayload>       AuthError;
	TKBVEChannel<FchuckChatStatePayload>       ChatState;
	TKBVEChannel<FchuckChatLinePayload>        ChatLine;
	TKBVEChannel<FchuckUiFlagsPayload>         UiFlags;
};
