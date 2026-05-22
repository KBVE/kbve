/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
	clearSnapshot,
	loadSnapshot,
	saveSnapshot,
	type SaveSnapshot,
} from './save';

const sample: SaveSnapshot = {
	v: 1,
	wave: 3,
	gold: 250,
	freeBasicTowers: 1,
	bountyBonusMultiplier: 1.5,
	stats: {
		goldEarned: 800,
		enemiesKilled: 42,
		bossesKilled: 1,
		buildingsBuilt: 7,
	},
	buildings: [
		{
			id: 'basic',
			col: 3,
			row: 5,
			hp: 200,
			armor: 50,
			towerUpgrades: { radar: 1, attack: 2, speed: 0, armor: 1 },
		},
		{
			id: 'battery',
			col: 4,
			row: 5,
			hp: 460,
			armor: 0,
			batteryCharge: 18,
		},
	],
};

describe('state/save', () => {
	beforeEach(() => clearSnapshot());

	it('round-trips snapshot through localStorage', () => {
		saveSnapshot(sample);
		const loaded = loadSnapshot();
		expect(loaded).toEqual(sample);
	});

	it('clearSnapshot removes saved state', () => {
		saveSnapshot(sample);
		clearSnapshot();
		expect(loadSnapshot()).toBeNull();
	});

	it('returns null when nothing saved', () => {
		expect(loadSnapshot()).toBeNull();
	});

	it('rejects stale v != 1', () => {
		window.localStorage.setItem(
			'td_save_v1',
			JSON.stringify({ ...sample, v: 99 }),
		);
		expect(loadSnapshot()).toBeNull();
	});

	it('returns null on malformed JSON', () => {
		window.localStorage.setItem('td_save_v1', '{not json');
		expect(loadSnapshot()).toBeNull();
	});
});
