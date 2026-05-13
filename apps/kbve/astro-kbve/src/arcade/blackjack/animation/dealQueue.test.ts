import { describe, expect, it } from 'vitest';

import { collectNewDealPlacements } from './dealQueue';

interface TestPlacement {
	owner: 'dealer' | 'player';
	index: number;
}

function placement(owner: TestPlacement['owner'], index: number) {
	return { owner, index };
}

function labels(queue: readonly TestPlacement[]) {
	return queue.map((card) => `${card.owner}:${card.index}`);
}

describe('blackjack deal queue', () => {
	it('queues an opening deal in table order without sorting', () => {
		const dealer = [placement('dealer', 0), placement('dealer', 1)];
		const player = [placement('player', 0), placement('player', 1)];
		const queue: TestPlacement[] = [];

		const count = collectNewDealPlacements(queue, dealer, player, 0, 0);

		expect(count).toBe(4);
		expect(labels(queue)).toEqual([
			'player:0',
			'dealer:0',
			'player:1',
			'dealer:1',
		]);
	});

	it('queues only newly drawn player cards', () => {
		const dealer = [placement('dealer', 0), placement('dealer', 1)];
		const player = [
			placement('player', 0),
			placement('player', 1),
			placement('player', 2),
		];
		const queue = [placement('dealer', 99)];

		const count = collectNewDealPlacements(queue, dealer, player, 2, 2);

		expect(count).toBe(1);
		expect(labels(queue)).toEqual(['player:2']);
	});

	it('queues dealer draw-down cards sequentially after stand', () => {
		const dealer = [
			placement('dealer', 0),
			placement('dealer', 1),
			placement('dealer', 2),
			placement('dealer', 3),
		];
		const player = [placement('player', 0), placement('player', 1)];
		const queue: TestPlacement[] = [];

		const count = collectNewDealPlacements(queue, dealer, player, 2, 2);

		expect(count).toBe(2);
		expect(labels(queue)).toEqual(['dealer:2', 'dealer:3']);
	});
});
