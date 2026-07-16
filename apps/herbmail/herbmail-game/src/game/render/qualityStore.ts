import { setPsx, getPsx } from '../menu/settingsStore';
import { PSX_DEFAULTS } from '../config';
import { psxMaterialRegistry } from './PsxMaterial';

interface Tier {
	dprMul: number;
	pomMax: number;
	ao: boolean;
}

// Best -> lowest. dpr scales fill, pomMax scales the per-pixel POM march, ao
// drops the post pass. All three are live-tunable with no geometry rebuild or
// shader recompile, so the adaptive loop can move between them every second.
const TIERS: Tier[] = [
	{ dprMul: 1.0, pomMax: 12, ao: true },
	{ dprMul: 0.85, pomMax: 8, ao: true },
	{ dprMul: 0.7, pomMax: 6, ao: false },
	{ dprMul: 0.55, pomMax: 4, ao: false },
];

const BASE_DPR = PSX_DEFAULTS.dpr;
let tier = 0;
let auto = true;
let aoOn = TIERS[0].ao;
const aoListeners = new Set<() => void>();

export function aoEnabled(): boolean {
	return aoOn;
}
export function subscribeAo(cb: () => void): () => void {
	aoListeners.add(cb);
	return () => aoListeners.delete(cb);
}

export function qualityTier(): number {
	return tier;
}
export function tierCount(): number {
	return TIERS.length;
}
export function autoQuality(): boolean {
	return auto;
}
export function setAutoQuality(v: boolean): void {
	auto = v;
}

// Re-applied every evaluation so streamed-in materials pick up the current tier.
export function reapplyPom(): void {
	const max = TIERS[tier].pomMax;
	for (const m of psxMaterialRegistry) {
		const u = (
			m as unknown as { uniforms?: Record<string, { value: unknown }> }
		).uniforms;
		if (u?.uPomMax) u.uPomMax.value = max;
	}
}

function applyTier(): void {
	const t = TIERS[tier];
	const dpr = +(BASE_DPR * t.dprMul).toFixed(3);
	if (getPsx().dpr !== dpr) setPsx('dpr', dpr);
	reapplyPom();
	if (aoOn !== t.ao) {
		aoOn = t.ao;
		for (const l of aoListeners) l();
	}
}

export function stepDown(): boolean {
	if (tier >= TIERS.length - 1) return false;
	tier++;
	applyTier();
	return true;
}
export function stepUp(): boolean {
	if (tier <= 0) return false;
	tier--;
	applyTier();
	return true;
}
