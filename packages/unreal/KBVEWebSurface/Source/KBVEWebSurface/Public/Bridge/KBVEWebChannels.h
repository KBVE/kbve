#pragma once

#include "CoreMinimal.h"

/**
 * Canonical bridge channel names every KBVE web surface speaks. Consumers
 * and embedded web apps agree on these to avoid drifting per-project.
 *
 * Anything outside this list is project-specific and should not be added
 * here without a cross-project use case.
 */
namespace KBVEWebChannels
{
	/** JS → UE: page has hydrated and is ready to receive Push() messages. */
	static const FName Ready = TEXT("terminal.ready");

	/** JS → UE: user clicked close / X. Consumer should detach focus and hide. */
	static const FName Close = TEXT("terminal.close");

	/** JS → UE: page title changed; consumer may surface as in-world label. */
	static const FName Title = TEXT("terminal.title");

	/** JS → UE: page emitted an audio cue tag; consumer plays spatial sound. */
	static const FName Audio = TEXT("terminal.audio");

	/** JS → UE: page wants a fresh JWT — consumer should re-Push via Auth.RefreshOut. */
	static const FName AuthRefresh = TEXT("auth.refresh");

	/** UE → JS: new JWT delivered for consumption. */
	static const FName AuthToken = TEXT("auth.token");

	/** JS → UE: gameplay inventory action requested. */
	static const FName InventoryUse = TEXT("inventory.use");
	static const FName InventoryEquip = TEXT("inventory.equip");

	/** JS → UE: marketplace transaction outcome. Payload includes order id + status. */
	static const FName MarketPurchase = TEXT("market.purchase");

	/** UE → JS: gameplay state hint (e.g. player moved, focus lost). */
	static const FName GameState = TEXT("game.state");
}
