import type { BuildId } from '../config';

const STORAGE_KEY = 'td_save_v1';

export interface SavedBuilding {
	id: BuildId;
	col: number;
	row: number;
	hp: number;
	armor: number;
	towerUpgrades?: {
		radar?: number;
		attack?: number;
		speed?: number;
		armor?: number;
	};
	armouryUpgrades?: {
		capacity?: number;
		damage?: number;
		vigor?: number;
		tempo?: number;
	};
	repairUpgrades?: {
		reach?: number;
		yield?: number;
		tempo?: number;
	};
	batteryCharge?: number;
}

export interface SaveSnapshot {
	v: 1;
	wave: number;
	gold: number;
	freeBasicTowers: number;
	bountyBonusMultiplier: number;
	seed?: number;
	stats: {
		goldEarned: number;
		enemiesKilled: number;
		bossesKilled: number;
		buildingsBuilt: number;
	};
	buildings: SavedBuilding[];
}

export function saveSnapshot(snap: SaveSnapshot): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
	} catch {
		// ignore quota / private-mode errors
	}
}

export function loadSnapshot(): SaveSnapshot | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as SaveSnapshot;
		if (parsed.v !== 1) return null;
		return parsed;
	} catch {
		return null;
	}
}

export function clearSnapshot(): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
