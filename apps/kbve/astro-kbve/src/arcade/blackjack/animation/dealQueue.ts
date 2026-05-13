interface IndexedDealPlacement {
	index: number;
}

export function collectNewDealPlacements<
	TPlacement extends IndexedDealPlacement,
>(
	queue: TPlacement[],
	dealerCards: readonly TPlacement[],
	playerCards: readonly TPlacement[],
	previousDealerCount: number,
	previousPlayerCount: number,
): number {
	queue.length = 0;

	const maxCards = Math.max(dealerCards.length, playerCards.length);
	for (let index = 0; index < maxCards; index++) {
		if (index >= previousPlayerCount && index < playerCards.length) {
			queue.push(playerCards[index]);
		}
		if (index >= previousDealerCount && index < dealerCards.length) {
			queue.push(dealerCards[index]);
		}
	}

	return queue.length;
}
